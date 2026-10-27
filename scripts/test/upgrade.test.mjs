import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { runInstall } from '../install.mjs';
import { runUpgrade, compareVersions, parseVersion } from '../lib/upgrade.mjs';
import { readManifest } from '../lib/manifest.mjs';

const ROOT = path.resolve(import.meta.dirname, '..', '..');

function installed() {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'helm-up-'));
  const home = path.join(base, 'home');
  const dest = path.join(base, '.claude');
  const res = runInstall({ target: 'claude', agentDir: dest, homeDir: home, sourceDir: ROOT, cwd: base, json: true });
  assert.equal(res.exit, 0, JSON.stringify(res));
  return { base, home, dest };
}

test('compareVersions 语义化边界', () => {
  assert.equal(compareVersions('0.2.0', '0.2.0-rc.1'), 1);
  assert.equal(compareVersions('0.2.0-rc.1', '0.2.0'), -1);
  assert.equal(compareVersions('1.10.0', '1.9.9'), 1);
  assert.equal(compareVersions('0.2.0', '0.2.0'), 0);
  assert.equal(compareVersions('x', '0.2.0'), null);
  assert.equal(parseVersion('v1.2.3').valid, true);
});

test('无 --source-dir 时只刷表面，不换 payload', () => {
  const box = installed();
  const before = readManifest(box.dest);
  const result = runUpgrade({ agentDir: box.dest, homeDir: box.home, json: true });
  assert.equal(result.exit, 0, JSON.stringify(result));
  const after = readManifest(box.dest);
  assert.equal(after.version, before.version);
  assert.equal(after.payload_root, before.payload_root);
});

test('--source-dir 升级并生成 .helm-version.bak', () => {
  const box = installed();
  fs.rmSync(path.join(box.dest, '.helm-version.bak'), { force: true });
  const result = runUpgrade({ agentDir: box.dest, homeDir: box.home, sourceDir: ROOT, json: true });
  assert.equal(result.exit, 0, JSON.stringify(result));
  assert.ok(fs.existsSync(path.join(box.dest, '.helm-version.bak')));
});

test('降级被拒绝（CONFLICT=4）', () => {
  const box = installed();
  const fake = path.join(box.base, 'fake-src');
  fs.mkdirSync(fake, { recursive: true });
  // 比当前版本低一档，用来触发降级保护；用 0.0.0 是因为仓库首版就是 0.0.1
  fs.writeFileSync(path.join(fake, 'package.json'), JSON.stringify({ name: 'helm-workflow', version: '0.0.0' }), 'utf8');
  const result = runUpgrade({ agentDir: box.dest, homeDir: box.home, sourceDir: fake, json: true });
  assert.equal(result.exit, 4);
});

test('共享 payload 的子集升级被拒绝，--all 放行', () => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'helm-up2-'));
  const home = path.join(base, 'home');
  const a = path.join(base, '.claude');
  const b = path.join(base, '.cursor');
  assert.equal(runInstall({ target: 'claude', agentDir: a, homeDir: home, sourceDir: ROOT, cwd: base, json: true }).exit, 0);
  assert.equal(runInstall({ target: 'cursor', agentDir: b, homeDir: home, sourceDir: ROOT, cwd: base, json: true }).exit, 0);
  const subset = runUpgrade({ target: 'claude', homeDir: home, sourceDir: ROOT, cwd: base, json: true });
  assert.equal(subset.exit, 4, JSON.stringify(subset));
  const all = runUpgrade({ all: true, homeDir: home, sourceDir: ROOT, cwd: base, json: true });
  assert.equal(all.exit, 0, JSON.stringify(all));
});
