import { readFileSync } from 'node:fs';
import { ProtocolYieldData, YieldComparisonEngine } from '../src/yieldComparison';

const numericFields = [
  'currentApy', 'historicalApy7d', 'historicalApy30d', 'tvlUsdc', 'volatility', 'riskScore',
] as const;

function isObservation(value: unknown): value is ProtocolYieldData {
  if (!value || typeof value !== 'object') return false;
  const row = value as Record<string, unknown>;
  return typeof row.protocolId === 'string' && row.protocolId.trim() !== '' &&
    typeof row.name === 'string' &&
    (row.type === 'blend' || row.type === 'dex_lp' || row.type === 'other') &&
    numericFields.every((field) => Number.isFinite(row[field])) &&
    (row.fetchedAt === undefined || Number.isFinite(row.fetchedAt));
}

try {
  const [fixturePath, ...extraArgs] = process.argv.slice(2);
  if (!fixturePath || extraArgs.length) {
    throw new Error('Usage: npm run replay:yields -- <fixture.json>');
  }

  const observations: unknown = JSON.parse(readFileSync(fixturePath, 'utf8'));
  if (!Array.isArray(observations) || !observations.every(isObservation)) {
    throw new Error('Expected a JSON array of valid protocol yield observations');
  }

  const ranked = new YieldComparisonEngine().rankOpportunities(observations);
  console.log(JSON.stringify(ranked, null, 2));
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
