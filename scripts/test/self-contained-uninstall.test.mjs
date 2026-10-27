import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { runInstall } from '../install.mjs';
import { resolveUninstallConfigRoot } from '../uninstall.mjs';

const ROOT = path.resolve(import.meta.dirname, '..', '..');

test('.helm-runtime 自带 hosts 快照，卸载不依赖源仓', () => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'helm-self-'));
  const home = path.join(base, 'home');
  const dest = path.join(base, '.cursor');
  assert.equal(runInstall({ target: 'cursor', agentDir: dest, homeDir: home, sourceDir: ROOT, cwd: base, json: true }).exit, 0);

  const runtime = path.join(dest, '.helm-runtime');
  assert.ok(fs.existsSync(path.join(runtime, 'uninstall.mjs')), '缺 .helm-runtime/uninstall.mjs');
  assert.ok(fs.existsSync(path.join(runtime, 'hosts.snapshot.json')), '缺 hosts 快照');
  assert.ok(fs.existsSync(path.join(runtime, 'lib', 'host-config.mjs')));

  // resolveUninstallConfigRoot 在 .helm-runtime 目录下应找到 hosts.snapshot.json
  const cfgRoot = resolveUninstallConfigRoot({});
  assert.ok(fs.existsSync(path.join(cfgRoot, 'hosts.json')) || fs.existsSync(path.join(cfgRoot, 'scripts', 'hosts.json')));
});

test('用安装目录内的运行时卸载（脱离源仓）', () => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'helm-self2-'));
  const home = path.join(base, 'home');
  const dest = path.join(base, '.cursor');
  assert.equal(runInstall({ target: 'cursor', agentDir: dest, homeDir: home, sourceDir: ROOT, cwd: base, json: true }).exit, 0);

  const runtimeUninstall = path.join(dest, '.helm-runtime', 'uninstall.mjs');
  const out = execFileSync('node', [runtimeUninstall, '--agent-dir', dest, '--home', home, '--json'], {
    encoding: 'utf8',
    timeout: 120000
  });
  const parsed = JSON.parse(out.slice(out.indexOf('{')));
  assert.equal(parsed.exit, 0, out);
  assert.equal(fs.existsSync(path.join(dest, '.helm-version')), false);
  assert.ok(fs.existsSync(path.join(dest, 'helm-workflow.local.yaml')), '用户配置必须保留');
});
