#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const dir = path.join(__dirname, '..', 'messages');
const locales = ['en', 'es', 'fr', 'pt', 'zh', 'ja'];
const required = ['amountLabel', 'decimalHelp', 'invalidAmount', 'amountOutOfRange', 'available', 'capRemaining', 'max', 'confirmDeposit', 'confirmWithdraw'];
let failed = false;

for (const locale of locales) {
  const file = path.join(dir, `${locale}.json`);
  const messages = JSON.parse(fs.readFileSync(file, 'utf8'));
  const transaction = messages.ActionModal || {};
  const missing = required.filter((key) => typeof transaction[key] !== 'string' || !transaction[key].trim());
  if (missing.length) {
    console.error(`[${locale}] Missing transaction form translations: ${missing.join(', ')}`);
    failed = true;
  }
  if (locale !== 'en' && transaction.decimalHelp === JSON.parse(fs.readFileSync(path.join(dir, 'en.json'), 'utf8')).ActionModal.decimalHelp) {
    console.error(`[${locale}] Decimal guidance is still English`);
    failed = true;
  }
}

if (failed) process.exit(1);
console.log('Transaction form locale coverage is complete.');
