import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { runInstall } from '../install.mjs';
import { runCheck } from '../install-check.mjs';
import { loadHosts } from '../lib/host-config.mjs';
import { STAGES, resolveCommandPath } from '../lib/host-paths.mjs';

const ROOT = path.resolve(import.meta.dirname, '..', '..');
const cfg = loadHosts(ROOT);

function sandbox() {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'helm-all-'));
  return { base, home: path.join(base, 'home'), cwd: path.join(base, 'proj'), dest: path.join(base, 'dest') };
}

test('每个 ready 宿主都能装到临时目录并 check 全 PASS', () => {
  for (const [key, host] of Object.entries(cfg.hosts)) {
    if (host.status !== 'ready') continue;
    const box = sandbox();
    const dest = path.join(box.dest, host.agentDir);
    const result = runInstall({
      target: key,
      agentDir: dest,
      homeDir: box.home,
      sourceDir: ROOT,
      cwd: box.cwd,
      json: true,
      ref: null,
      commit: null
    });
    assert.equal(result.exit, 0, `${key} 安装失败: ${JSON.stringify(result)}`);
    assert.ok(fs.existsSync(path.join(dest, '.helm-version')), `${key} 缺清单`);
    for (const stage of STAGES) {
      assert.ok(fs.existsSync(path.join(dest, resolveCommandPath(host, stage))), `${key} 缺 ${stage}`);
    }
    assert.ok(fs.existsSync(path.join(dest, '.helm-runtime', 'uninstall.mjs')), `${key} 缺运行时`);
    const check = runCheck({ agentDir: dest, homeDir: box.home, json: true });
    assert.equal(check.failed, 0, `${key} check 有 fail: ${JSON.stringify(check.results?.[0]?.items?.filter((i) => i.status === 'fail'))}`);
  }
});

test('opencode 目标目录由安装器自建（源内不存在也是常态）', () => {
  const box = sandbox();
  const dest = path.join(box.dest, '.opencode');
  assert.equal(fs.existsSync(dest), false);
  const result = runInstall({ target: 'opencode', agentDir: dest, homeDir: box.home, sourceDir: ROOT, cwd: box.cwd, json: true });
  assert.equal(result.exit, 0);
  assert.ok(fs.existsSync(path.join(dest, 'commands')));
});

test('多个宿主解析到同一目录时拒绝（ARG=2）', () => {
  const box = sandbox();
  const dest = path.join(box.dest, 'same');
  const result = runInstall({ target: 'claude,cursor', agentDir: dest, homeDir: box.home, sourceDir: ROOT, cwd: box.cwd, json: true });
  assert.equal(result.exit, 2);
});
