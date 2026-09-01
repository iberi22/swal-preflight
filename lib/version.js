// lib/version.js — manifest discovery + semver helpers
import fs from 'node:fs';
import path from 'node:path';
import semver from 'semver';

const MANIFEST_PATTERNS = [
  { file: 'Cargo.toml', parse: parseCargo, key: 'cargo' },
  { file: 'package.json', parse: parsePackageJson, key: 'package' },
  { file: 'panel-ui/package.json', parse: parsePackageJson, key: 'panel-ui' },
  { file: 'panel-ui/src-tauri/tauri.conf.json', parse: parseTauri, key: 'tauri' },
  { file: 'code-graph/Cargo.toml', parse: parseCargo, key: 'code-graph' },
  { file: 'Cargo.toml', parse: parseCargo, key: 'cargo-root', dir: 'crates/xavier-core-logic' },
];

function parseCargo(content) {
  const m = content.match(/^\s*version\s*=\s*"([^"]+)"/m);
  return m ? m[1] : null;
}
function parsePackageJson(content) {
  try { return JSON.parse(content).version || null; } catch { return null; }
}
function parseTauri(content) {
  try { return JSON.parse(content).version || null; } catch { return null; }
}

export function discoverVersions(cwd) {
  const results = [];
  // Root Cargo
  const cargoRoot = path.join(cwd, 'Cargo.toml');
  if (fs.existsSync(cargoRoot)) {
    const v = parseCargo(fs.readFileSync(cargoRoot, 'utf8'));
    if (v) results.push({ file: 'Cargo.toml', version: v, key: 'cargo' });
  }
  // package.json root
  const pkg = path.join(cwd, 'package.json');
  if (fs.existsSync(pkg)) {
    const v = parsePackageJson(fs.readFileSync(pkg, 'utf8'));
    if (v) results.push({ file: 'package.json', version: v, key: 'package' });
  }
  // panel-ui
  for (const rel of ['panel-ui/package.json', 'panel-ui/src-tauri/tauri.conf.json']) {
    const p = path.join(cwd, rel);
    if (fs.existsSync(p)) {
      const raw = fs.readFileSync(p, 'utf8');
      const v = rel.endsWith('.json') && rel.includes('tauri') ? parseTauri(raw) : parsePackageJson(raw);
      if (v) results.push({ file: rel, version: v, key: rel });
    }
  }
  // crates
  for (const rel of ['code-graph/Cargo.toml', 'crates/xavier-core-logic/Cargo.toml']) {
    const p = path.join(cwd, rel);
    if (fs.existsSync(p)) {
      const v = parseCargo(fs.readFileSync(p, 'utf8'));
      if (v) results.push({ file: rel, version: v, key: rel });
    }
  }
  // docs site
  const docsPkg = path.join(cwd, 'docs/site/package.json');
  if (fs.existsSync(docsPkg)) {
    const v = parsePackageJson(fs.readFileSync(docsPkg, 'utf8'));
    if (v) results.push({ file: 'docs/site/package.json', version: v, key: 'docs/site' });
  }
  return results;
}

export function checkSync(versions) {
  if (versions.length === 0) return { ok: true, versions: [] };
  // Only primary manifests must sync (Cargo.toml, package.json, tauri)
  const primary = versions.filter(v => ['cargo', 'package', 'panel-ui/src-tauri/tauri.conf.json'].includes(v.key) || v.file === 'Cargo.toml' || v.file === 'package.json' || v.file === 'panel-ui/src-tauri/tauri.conf.json');
  const uniq = [...new Set(primary.map(v => v.version))];
  return { ok: uniq.length <= 1, uniq, primary, all: versions };
}

export function suggestBump(commits, current) {
  // commits: array of { message }
  let hasBreaking = false, hasFeat = false, hasFix = false;
  for (const c of commits) {
    const msg = c.message || c;
    if (/^[a-z]+(\(.+\))?!:/.test(msg) || msg.includes('BREAKING CHANGE')) hasBreaking = true;
    else if (/^feat(\(.+\))?:/.test(msg)) hasFeat = true;
    else if (/^fix(\(.+\))?:/.test(msg)) hasFix = true;
  }
  const cur = semver.parse(current) || semver.parse(semver.coerce(current));
  if (!cur) return null;
  const isZero = cur.major === 0;
  if (hasBreaking) return isZero ? semver.inc(current, 'minor') : semver.inc(current, 'major');
  if (hasFeat) return semver.inc(current, 'minor');
  if (hasFix) return semver.inc(current, 'patch');
  return null; // no bump needed
}

export function isValidSemver(v) { return !!semver.valid(v); }
export function cleanSemver(v) { return semver.clean(v) || v; }
