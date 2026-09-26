/**
 * Accessibility Automated Tests — axe-core in CI via Playwright (#90)
 *
 * Scans all core application pages against WCAG 2.1 Level AA standards:
 * - Pages: /, /dashboard, /deposit, /withdraw, /stats, /admin
 * - Zero critical or serious violations allowed (CI fails on any)
 * - Moderate and minor violations logged as warnings (non-blocking)
 * - Detailed reporting: rule ID, impact, element selectors, and help URL
 * - Generates report saved as CI artifact (HTML + JSON)
 * - Baseline support: only new violations block PRs
 */

import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import * as fs from 'fs';
import * as path from 'path';

const PAGES = [
  { path: '/', name: 'Landing Page' },
  { path: '/dashboard', name: 'Dashboard' },
  { path: '/deposit', name: 'Deposit Page' },
  { path: '/withdraw', name: 'Withdraw Page' },
  { path: '/stats', name: 'Protocol Stats' },
  { path: '/admin', name: 'Admin Controls' },
];

interface ViolationDetail {
  page: string;
  ruleId: string;
  impact: string;
  description: string;
  helpUrl: string;
  elements: string[];
  failureSummary: string[];
}

interface PageScanResult {
  page: string;
  name: string;
  timestamp: string;
  violationsCount: number;
  criticalCount: number;
  seriousCount: number;
  moderateCount: number;
  minorCount: number;
  violations: ViolationDetail[];
}

const allScanResults: PageScanResult[] = [];
const REPORT_DIR = path.resolve(process.cwd(), 'accessibility-reports');
const BASELINE_PATH = path.resolve(__dirname, 'a11y-baseline.json');

// Ensure report output directory exists
if (!fs.existsSync(REPORT_DIR)) {
  fs.mkdirSync(REPORT_DIR, { recursive: true });
}

// Load baseline exceptions
let baselineEntries: Array<{ ruleId: string; selector?: string }> = [];
if (fs.existsSync(BASELINE_PATH)) {
  try {
    const raw = fs.readFileSync(BASELINE_PATH, 'utf-8');
    const parsed = JSON.parse(raw);
    baselineEntries = parsed.knownViolations || [];
  } catch (err) {
    console.warn('[a11y] Failed to parse baseline file, continuing without baseline:', err);
  }
}

function isBaselineViolation(ruleId: string, selector: string): boolean {
  return baselineEntries.some(
    (b) => b.ruleId === ruleId && (!b.selector || selector.includes(b.selector)),
  );
}

for (const pageConfig of PAGES) {
  test(`Accessibility scan on ${pageConfig.path} (${pageConfig.name})`, async ({ page }) => {
    // Navigate to page
    await page.goto(pageConfig.path);
    await page.waitForLoadState('domcontentloaded');

    // Run axe-core analysis with WCAG 2.1 AA tags
    const accessibilityScanResults = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .disableRules([]) // Can disable specific rules for verified third-party false positives
      .analyze();

    const violations = accessibilityScanResults.violations;

    const blockingViolations: ViolationDetail[] = [];
    const warningViolations: ViolationDetail[] = [];

    const detailedViolations: ViolationDetail[] = [];

    for (const v of violations) {
      const impact = v.impact || 'minor';
      const elements = v.nodes.map((n) => n.target.join(' '));
      const failureSummary = v.nodes.map((n) => n.failureSummary || '');

      const detail: ViolationDetail = {
        page: pageConfig.path,
        ruleId: v.id,
        impact,
        description: v.help,
        helpUrl: v.helpUrl,
        elements,
        failureSummary,
      };

      detailedViolations.push(detail);

      // Check if known baseline violation
      const isKnown = elements.some((sel) => isBaselineViolation(v.id, sel));

      if (impact === 'critical' || impact === 'serious') {
        if (!isKnown) {
          blockingViolations.push(detail);
        } else {
          console.log(`[a11y] Permitted baseline violation: [${impact.toUpperCase()}] ${v.id} on ${elements.join(', ')}`);
        }
      } else {
        warningViolations.push(detail);
      }
    }

    // Log warnings for moderate and minor issues
    if (warningViolations.length > 0) {
      console.warn(`\n⚠️  [A11Y WARNINGS] ${warningViolations.length} non-blocking issues on ${pageConfig.path}:`);
      for (const w of warningViolations) {
        console.warn(`  • [${w.impact.toUpperCase()}] Rule: ${w.ruleId}`);
        console.warn(`    Element: ${w.elements.join(', ')}`);
        console.warn(`    Info:    ${w.helpUrl}`);
      }
    }

    // Log blocking critical/serious issues
    if (blockingViolations.length > 0) {
      console.error(`\n❌  [A11Y BLOCKING] ${blockingViolations.length} critical/serious violations on ${pageConfig.path}:`);
      for (const b of blockingViolations) {
        console.error(`  • [${b.impact.toUpperCase()}] Rule ID: ${b.ruleId}`);
        console.error(`    Description: ${b.description}`);
        console.error(`    Help URL:    ${b.helpUrl}`);
        console.error(`    Elements:    ${b.elements.join(', ')}`);
      }
    }

    // Record page metrics
    const pageResult: PageScanResult = {
      page: pageConfig.path,
      name: pageConfig.name,
      timestamp: new Date().toISOString(),
      violationsCount: violations.length,
      criticalCount: violations.filter((v) => v.impact === 'critical').length,
      seriousCount: violations.filter((v) => v.impact === 'serious').length,
      moderateCount: violations.filter((v) => v.impact === 'moderate').length,
      minorCount: violations.filter((v) => v.impact === 'minor').length,
      violations: detailedViolations,
    };
    allScanResults.push(pageResult);

    // Assert zero critical or serious blocking violations
    expect(
      blockingViolations.length,
      `Page ${pageConfig.path} has ${blockingViolations.length} critical/serious WCAG violations that violate the zero-tolerance policy. Check accessibility report for details.`,
    ).toBe(0);
  });
}

test.afterAll(async () => {
  // Save combined JSON report
  const jsonReportPath = path.join(REPORT_DIR, 'a11y-report.json');
  fs.writeFileSync(
    jsonReportPath,
    JSON.stringify(
      {
        suite: 'NeuroWealth Accessibility Test Suite (axe-core / Playwright)',
        standard: 'WCAG 2.1 Level AA',
        generatedAt: new Date().toISOString(),
        totalPagesScanned: allScanResults.length,
        totalViolations: allScanResults.reduce((acc, r) => acc + r.violationsCount, 0),
        totalCritical: allScanResults.reduce((acc, r) => acc + r.criticalCount, 0),
        totalSerious: allScanResults.reduce((acc, r) => acc + r.seriousCount, 0),
        totalModerate: allScanResults.reduce((acc, r) => acc + r.moderateCount, 0),
        totalMinor: allScanResults.reduce((acc, r) => acc + r.minorCount, 0),
        pages: allScanResults,
      },
      null,
      2,
    ),
  );
  console.log(`[a11y] JSON report saved: ${jsonReportPath}`);

  // Save standalone HTML report
  const htmlReportPath = path.join(REPORT_DIR, 'a11y-report.html');
  const totalViolations = allScanResults.reduce((acc, r) => acc + r.violationsCount, 0);
  const totalCritical = allScanResults.reduce((acc, r) => acc + r.criticalCount, 0);
  const totalSerious = allScanResults.reduce((acc, r) => acc + r.seriousCount, 0);

  const htmlContent = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>NeuroWealth — Accessibility Scan Report</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #0b0f19; color: #e2e8f0; margin: 0; padding: 2rem; }
    .container { max-width: 1000px; margin: 0 auto; }
    h1 { font-size: 2rem; color: #fff; margin-bottom: 0.5rem; }
    .badge { display: inline-block; padding: 0.25rem 0.6rem; border-radius: 9999px; font-size: 0.75rem; font-weight: 700; text-transform: uppercase; }
    .badge-pass { background: rgba(16, 185, 129, 0.2); color: #34d399; border: 1px solid rgba(16, 185, 129, 0.4); }
    .badge-critical { background: rgba(239, 68, 68, 0.2); color: #f87171; border: 1px solid rgba(239, 68, 68, 0.4); }
    .badge-serious { background: rgba(249, 115, 22, 0.2); color: #fb923c; border: 1px solid rgba(249, 115, 22, 0.4); }
    .badge-moderate { background: rgba(234, 179, 8, 0.2); color: #facc15; border: 1px solid rgba(234, 179, 8, 0.4); }
    .badge-minor { background: rgba(148, 163, 184, 0.2); color: #94a3b8; border: 1px solid rgba(148, 163, 184, 0.4); }
    .stats-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 1rem; margin: 1.5rem 0; }
    .stat-card { background: #131b2e; border: 1px solid #1e293b; padding: 1.25rem; border-radius: 0.75rem; }
    .stat-val { font-size: 1.75rem; font-weight: 800; color: #fff; margin-top: 0.25rem; }
    .page-card { background: #131b2e; border: 1px solid #1e293b; border-radius: 0.75rem; margin-bottom: 1.5rem; overflow: hidden; }
    .page-header { padding: 1rem 1.25rem; background: #1e293b; display: flex; justify-content: space-between; align-items: center; }
    .page-content { padding: 1.25rem; }
    table { width: 100%; border-collapse: collapse; margin-top: 0.75rem; font-size: 0.875rem; }
    th, td { text-align: left; padding: 0.75rem; border-bottom: 1px solid #1e293b; }
    th { color: #94a3b8; font-weight: 600; text-transform: uppercase; font-size: 0.75rem; }
    code { font-family: monospace; background: #0f172a; padding: 0.2rem 0.4rem; border-radius: 0.25rem; font-size: 0.8rem; }
    a { color: #38bdf8; text-decoration: none; }
    a:hover { text-decoration: underline; }
  </style>
</head>
<body>
  <div class="container">
    <h1>NeuroWealth — Accessibility Audit Report</h1>
    <p>Target: <strong>WCAG 2.1 Level AA</strong> &bull; Engine: <strong>axe-core via Playwright</strong></p>

    <div class="stats-grid">
      <div class="stat-card">
        <div style="color: #94a3b8; font-size: 0.8rem;">TOTAL PAGES</div>
        <div class="stat-val">${allScanResults.length}</div>
      </div>
      <div class="stat-card">
        <div style="color: #94a3b8; font-size: 0.8rem;">CRITICAL</div>
        <div class="stat-val" style="color: ${totalCritical > 0 ? '#f87171' : '#34d399'};">${totalCritical}</div>
      </div>
      <div class="stat-card">
        <div style="color: #94a3b8; font-size: 0.8rem;">SERIOUS</div>
        <div class="stat-val" style="color: ${totalSerious > 0 ? '#fb923c' : '#34d399'};">${totalSerious}</div>
      </div>
      <div class="stat-card">
        <div style="color: #94a3b8; font-size: 0.8rem;">TOTAL ISSUES</div>
        <div class="stat-val">${totalViolations}</div>
      </div>
    </div>

    ${allScanResults
      .map(
        (page) => `
      <div class="page-card">
        <div class="page-header">
          <div><strong>${page.name}</strong> <code>${page.page}</code></div>
          <span class="badge ${page.criticalCount + page.seriousCount === 0 ? 'badge-pass' : 'badge-critical'}">
            ${page.criticalCount + page.seriousCount === 0 ? 'PASSED (0 BLOCKING)' : `${page.criticalCount + page.seriousCount} VIOLATIONS`}
          </span>
        </div>
        <div class="page-content">
          ${
            page.violations.length === 0
              ? '<p style="color: #34d399; margin: 0;">✓ Zero accessibility violations detected.</p>'
              : `
            <table>
              <thead>
                <tr>
                  <th>Rule ID</th>
                  <th>Impact</th>
                  <th>Description</th>
                  <th>Elements</th>
                  <th>Reference</th>
                </tr>
              </thead>
              <tbody>
                ${page.violations
                  .map(
                    (v) => `
                  <tr>
                    <td><code>${v.ruleId}</code></td>
                    <td><span class="badge badge-${v.impact}">${v.impact}</span></td>
                    <td>${v.description}</td>
                    <td><code>${v.elements.join(', ')}</code></td>
                    <td><a href="${v.helpUrl}" target="_blank" rel="noopener">Learn more &rarr;</a></td>
                  </tr>
                `,
                  )
                  .join('')}
              </tbody>
            </table>
          `
          }
        </div>
      </div>
    `,
      )
      .join('')}
  </div>
</body>
</html>`;

  fs.writeFileSync(htmlReportPath, htmlContent);
  console.log(`[a11y] HTML report saved: ${htmlReportPath}`);
});
