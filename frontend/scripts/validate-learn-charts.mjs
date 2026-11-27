import { readFileSync } from 'node:fs';
import { validateChartSample } from '../src/app/[locale]/learn/validate-chart-sample.mjs';

const file = new URL('../src/app/[locale]/learn/chart-samples.json', import.meta.url);
const samples = JSON.parse(readFileSync(file, 'utf8'));

if (!samples || typeof samples !== 'object' || Array.isArray(samples) || !Object.hasOwn(samples, 'compound-growth')) {
  throw new Error('Learn chart sample "compound-growth" is missing from chart-samples.json');
}

for (const [id, sample] of Object.entries(samples)) {
  const error = validateChartSample(sample);
  if (error) {
    console.error(`Invalid Learn chart sample "${id}" in chart-samples.json: ${error}`);
    process.exitCode = 1;
  }
}
