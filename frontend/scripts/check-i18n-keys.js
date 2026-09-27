#!/usr/bin/env node
/**
 * CI lint: detect missing or extra translation keys in locale files.
 *
 * Usage:  node scripts/check-i18n-keys.js
 *
 * Compares every locale file against en.json (source of truth).
 * Exits with code 1 if any key is missing or extra.
 */

const fs = require('fs');
const path = require('path');

const MESSAGES_DIR = path.join(__dirname, '..', 'messages');
const BASE_LOCALE = 'en';

/** Recursively collect all dot-notation keys from a nested object */
function collectKeys(obj, prefix = '') {
  const keys = [];
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (v !== null && typeof v === 'object' && !Array.isArray(v)) {
      keys.push(...collectKeys(v, key));
    } else {
      keys.push(key);
    }
  }
  return keys;
}

const baseFile = path.join(MESSAGES_DIR, `${BASE_LOCALE}.json`);
if (!fs.existsSync(baseFile)) {
  console.error(`Base locale file not found: ${baseFile}`);
  process.exit(1);
}

const baseMessages = JSON.parse(fs.readFileSync(baseFile, 'utf-8'));
const baseKeys = new Set(collectKeys(baseMessages));

const localeFiles = fs
  .readdirSync(MESSAGES_DIR)
  .filter((f) => f.endsWith('.json') && f !== `${BASE_LOCALE}.json`);

let hasErrors = false;

for (const file of localeFiles) {
  const locale = file.replace('.json', '');
  const filePath = path.join(MESSAGES_DIR, file);
  const messages = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  const keys = new Set(collectKeys(messages));

  const missing = [...baseKeys].filter((k) => !keys.has(k));
  const extra = [...keys].filter((k) => !baseKeys.has(k));

  if (missing.length > 0) {
    console.error(`\n[${locale}] Missing keys (${missing.length}):`);
    missing.forEach((k) => console.error(`  - ${k}`));
    hasErrors = true;
  }
  if (extra.length > 0) {
    console.warn(`\n[${locale}] Extra keys not in en.json (${extra.length}):`);
    extra.forEach((k) => console.warn(`  + ${k}`));
    // Extra keys are a warning, not an error
  }
  if (missing.length === 0 && extra.length === 0) {
    console.log(`[${locale}] ✓ All keys present`);
  }
}

if (hasErrors) {
  console.error('\n❌ i18n key check failed — add missing keys before merging.');
  process.exit(1);
} else {
  console.log('\n✅ i18n key check passed.');
}
