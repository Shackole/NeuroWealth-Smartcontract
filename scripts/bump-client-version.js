#!/usr/bin/env node
/**
 * Bump the generated vault-client package patch version when the generated
 * contract specification changes. The workflow calls this after generation.
 */

'use strict';

const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const packagePath = path.join(root, 'packages/vault-client/package.json');
const lockPath = path.join(root, 'packages/vault-client/package-lock.json');

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function writeJson(filePath, value) {
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function patchVersion(version) {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(version);
  if (!match) throw new Error(`Expected a stable semver version, got: ${version}`);
  return `${match[1]}.${match[2]}.${Number(match[3]) + 1}`;
}

const packageJson = readJson(packagePath);
const lockJson = readJson(lockPath);

if (!process.env.FORCE_CLIENT_VERSION_BUMP) {
  const result = require('child_process').spawnSync(
    'git',
    ['diff', '--quiet', '--', 'contract-spec.json'],
    { cwd: root },
  );
  if (result.status === 0) {
    console.log('Contract spec unchanged; vault-client version remains unchanged.');
    process.exit(0);
  }
}

const nextVersion = patchVersion(packageJson.version);
packageJson.version = nextVersion;
if (lockJson.packages?.['']) lockJson.packages[''].version = nextVersion;
lockJson.version = nextVersion;

writeJson(packagePath, packageJson);
writeJson(lockPath, lockJson);
console.log(`Bumped @neurowealth/vault-client to ${nextVersion}`);