#!/usr/bin/env node
import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

// Read version from root package.json
const rootPkg = JSON.parse(readFileSync('./package.json', 'utf8'));
const version = rootPkg.version;

if (!version) {
  console.error('Error: No version found in root package.json');
  process.exit(1);
}

console.log(`Syncing version ${version} to all files...`);

// Files to update
const files = [
  { path: 'extension/package.json', type: 'json', key: 'version' },
  { path: 'server/package.json', type: 'json', key: 'version' },
  { path: 'extension/manifest.json', type: 'json', key: 'version' },
  { path: 'extension/manifest.firefox.json', type: 'json', key: 'version' },
];

let updated = 0;
let unchanged = 0;

files.forEach(({ path, type, key }) => {
  try {
    const fullPath = join(process.cwd(), path);
    const content = JSON.parse(readFileSync(fullPath, 'utf8'));

    if (content[key] === version) {
      console.log(`✓ ${path} already at ${version}`);
      unchanged++;
    } else {
      content[key] = version;
      writeFileSync(fullPath, JSON.stringify(content, null, 2) + '\n');
      console.log(`✓ Updated ${path} to ${version}`);
      updated++;
    }
  } catch (err) {
    console.error(`✗ Failed to update ${path}:`, err.message);
    process.exit(1);
  }
});

console.log(`\nDone! Updated ${updated} file(s), ${unchanged} already current.`);
