import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { runInstall } from '../install.mjs';
import { runCheck, checkDir } from '../install-check.mjs';
import { loadHosts } from '../lib/host-config.mjs';
import { readManifest } from '../lib/manifest.mjs';

const ROOT = path.resolve(import.meta.dirname, '..', '..');
const cfg = loadHosts(ROOT);

function installed(hostKey = 'claude') {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'helm-chk-'));
  const home = path.join(base, 'home');
  const dest = path.join(base, cfg.hosts[hostKey].agentDir);
  const res = runInstall({ target: hostKey, agentDir: dest, homeDir: home, sourceDir: ROOT, cwd: base, json: true });
  assert.equal(res.exit, 0, JSON.stringify(res));
  return { base, home, dest };
}

test('删掉一个 managed_files 项 → 退出 1 且定位到该条', () => {
  const box = installed();
  const manifest = readManifest(box.dest);
  const victim = manifest.managed_files.find((rel) => rel.startsWith('templates/'));
  fs.rmSync(path.join(box.dest, victim), { force: true });

  const result = runCheck({ agentDir: box.dest, homeDir: box.home, json: true });
  assert.equal(result.exit, 1);
  const items = result.results[0].items;
  const failed = items.filter((i) => i.status === 'fail');
  assert.ok(failed.some((i) => i.name.includes(victim)), `未定位到 ${victim}: ${JSON.stringify(failed)}`);
});

test('warn 项不导致退出码 1', () => {
  const box = installed();
  fs.rmSync(path.join(box.dest, 'helm-workflow.local.yaml'), { force: true });
  const summary = checkDir(box.dest, cfg);
  assert.equal(summary.failed, 0);
  assert.ok(summary.warned >= 1, '期望至少一条 warn（用户配置缺失）');
});

test('三态互斥，passed+failed+warned 等于条目总数', () => {
  const box = installed();
  const summary = checkDir(box.dest, cfg);
  assert.equal(summary.passed + summary.failed + summary.warned, summary.items.length);
});
