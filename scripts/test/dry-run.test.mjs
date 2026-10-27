import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { runInstall } from '../install.mjs';
import { runUninstall } from '../uninstall.mjs';
import { runUpgrade } from '../lib/upgrade.mjs';

const ROOT = path.resolve(import.meta.dirname, '..', '..');

function snapshot(root) {
  const out = [];
  const walk = (dir, prefix) => {
    if (!fs.existsSync(dir)) return;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
      out.push(`${rel}:${entry.isDirectory() ? 'dir' : 'file'}`);
      if (entry.isDirectory()) walk(path.join(dir, entry.name), rel);
    }
  };
  walk(root, '');
  return out.join('\n');
}

test('install --dry-run 不产生任何磁盘变更', () => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'helm-dry-'));
  const home = path.join(base, 'home');
  const dest = path.join(base, '.claude');
  const before = snapshot(dest);

  const install = runInstall({ target: 'claude', agentDir: dest, homeDir: home, sourceDir: ROOT, dryRun: true, json: true });
  assert.equal(install.exit, 0, JSON.stringify(install));
  assert.equal(snapshot(dest), before, 'dry-run 修改了目标目录');
  assert.equal(snapshot(home), '', 'dry-run 创建了 home 目录');
});

test('已安装后 uninstall --dry-run 目录树不变', () => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'helm-dry2-'));
  const home = path.join(base, 'home');
  const dest = path.join(base, '.claude');
  assert.equal(runInstall({ target: 'claude', agentDir: dest, homeDir: home, sourceDir: ROOT, json: true }).exit, 0);
  const before = snapshot(dest);
  const result = runUninstall({ agentDir: dest, homeDir: home, dryRun: true, json: true });
  assert.equal(result.exit, 0, JSON.stringify(result));
  assert.equal(snapshot(dest), before);
});

test('upgrade --dry-run 不改清单', () => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'helm-dry3-'));
  const home = path.join(base, 'home');
  const dest = path.join(base, '.claude');
  assert.equal(runInstall({ target: 'claude', agentDir: dest, homeDir: home, sourceDir: ROOT, json: true }).exit, 0);
  const file = path.join(dest, '.helm-version');
  const before = fs.readFileSync(file, 'utf8');
  assert.equal(runUpgrade({ agentDir: dest, homeDir: home, sourceDir: ROOT, dryRun: true, json: true }).exit, 0);
  assert.equal(fs.readFileSync(file, 'utf8'), before);
});
