#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const sourceRoot = path.join(root, 'src');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'test-manifest.json'), 'utf8'));
const discovered = [];
const jestSuites = [];
const nodeSuites = [];

function walk(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) walk(absolute);
    else if (/\.(test|integration\.test)\.tsx?$/.test(entry.name)) {
      discovered.push(path.relative(root, absolute).split(path.sep).join('/'));
    }
  }
}

walk(sourceRoot);
discovered.sort();
const exclusions = new Map(manifest.excluded.map(({ file, reason }) => [file, reason]));
for (const excluded of exclusions.keys()) {
  if (!discovered.includes(excluded)) {
    console.error(`Test manifest excludes a file that was not discovered: ${excluded}`);
    process.exit(1);
  }
}

const included = discovered.filter((file) => !exclusions.has(file));
if (included.length === 0) {
  console.error('No runnable agent test files were discovered.');
  process.exit(1);
}

for (const file of included) {
  const source = fs.readFileSync(path.join(root, file), 'utf8');
  // The focused __tests__ suites use Jest mocks/assertions; all other current
  // suites use node:test globals or self-running assertion harnesses.
  if (/\bjest\.|\bexpect\(/.test(source)) jestSuites.push(file);
  else nodeSuites.push(file);
}
console.log(`Discovered ${discovered.length} agent test files: running ${nodeSuites.length} with node:test, ${jestSuites.length} with Jest, excluding ${exclusions.size}.`);
for (const [file, reason] of exclusions) console.log(`EXCLUDED ${file}: ${reason}`);
if (process.env.GITHUB_STEP_SUMMARY) {
  const lines = [
    '## Agent test inventory',
    '',
    `Discovered ${discovered.length}; scheduled ${nodeSuites.length} with node:test and ${jestSuites.length} with Jest; explicitly excluded ${exclusions.size}.`,
    '',
    ...[...exclusions].map(([file, reason]) => `- Excluded ${file}: ${reason}`),
    '',
  ].join('\n');
  fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, lines);
}

const commands = [];
if (nodeSuites.length) {
  commands.push([
    process.execPath,
    ['--test', '--import', 'ts-node/register/transpile-only', ...nodeSuites.map((file) => path.join(root, file))],
  ]);
}
if (jestSuites.length) {
  const jestBin = require.resolve('jest/bin/jest', { paths: [root] });
  commands.push([process.execPath, [jestBin, '--runInBand', '--config', path.join(root, 'jest.config.js'), ...jestSuites.map((file) => path.join(root, file))]]);
}
for (const [command, args] of commands) {
  const result = spawnSync(command, args, { cwd: root, stdio: 'inherit', env: process.env });
  if (result.error) {
    console.error(`Could not start ${path.basename(command)}: ${result.error.message}`);
    process.exit(1);
  }
  if (result.status !== 0) process.exit(result.status ?? 1);
}
