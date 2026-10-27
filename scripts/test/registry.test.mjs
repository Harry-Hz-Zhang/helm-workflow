import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  upsertInstallation,
  loadLedger,
  listInstallations,
  pruneStale,
  reconcileFromDirs,
  removeInstallation,
  withLedgerLock,
  normalizeAgentDir
} from '../lib/install-registry.mjs';
import { writeManifest } from '../lib/manifest.mjs';

function home() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'helm-reg-'));
}

function fakeInstall(root, name, hostKey = 'claude') {
  const dir = path.join(root, name, '.claude');
  fs.mkdirSync(dir, { recursive: true });
  writeManifest(dir, { version: '0.2.0', layout: 'helm-home-v2', host_key: hostKey, managed_files: ['a.md'], managed_dirs: [] });
  return dir;
}

test('并发 8 次 upsert 不丢条目', () => {
  const root = home();
  for (let i = 0; i < 8; i += 1) {
    upsertInstallation({ host_key: 'claude', agent_dir: path.join(root, `p${i}`, '.claude'), version: '0.2.0' }, root);
  }
  assert.equal(loadLedger(root).installations.length, 8);
});

test('同一目录重复 upsert 只保留一条并更新版本', () => {
  const root = home();
  const dir = path.join(root, 'p', '.claude');
  upsertInstallation({ host_key: 'claude', agent_dir: dir, version: '0.1.0' }, root);
  upsertInstallation({ host_key: 'claude', agent_dir: dir, version: '0.2.0' }, root);
  const rows = loadLedger(root).installations;
  assert.equal(rows.length, 1);
  assert.equal(rows[0].version, '0.2.0');
});

test('prune 只删 missing / broken', () => {
  const root = home();
  const ok = fakeInstall(root, 'ok');
  upsertInstallation({ host_key: 'claude', agent_dir: ok, version: '0.2.0' }, root);
  upsertInstallation({ host_key: 'claude', agent_dir: path.join(root, 'gone', '.claude'), version: '0.2.0' }, root);
  const broken = path.join(root, 'broken', '.claude');
  fs.mkdirSync(broken, { recursive: true });
  upsertInstallation({ host_key: 'claude', agent_dir: broken, version: '0.2.0' }, root);

  const removed = pruneStale(root);
  assert.equal(removed.length, 2);
  const left = listInstallations(root);
  assert.equal(left.length, 1);
  assert.equal(normalizeAgentDir(left[0].agent_dir), normalizeAgentDir(ok));
});

test('reconcile 只增不删', () => {
  const root = home();
  const a = fakeInstall(root, 'a');
  const b = fakeInstall(root, 'b');
  upsertInstallation({ host_key: 'claude', agent_dir: path.join(root, 'ghost', '.claude'), version: '0.1.0' }, root);
  reconcileFromDirs(root, [a, b]);
  const rows = loadLedger(root).installations;
  assert.ok(rows.length >= 3, `期望保留 ghost + a + b，实际 ${rows.length}`);
});

test('removeInstallation 返回删除条数', () => {
  const root = home();
  const a = fakeInstall(root, 'a');
  upsertInstallation({ host_key: 'claude', agent_dir: a, version: '0.2.0' }, root);
  assert.equal(removeInstallation(a, root), 1);
  assert.equal(removeInstallation(a, root), 0);
});

test('锁超时抛 ELEDGERBUSY', () => {
  const root = home();
  fs.writeFileSync(path.join(root, 'installations.lock'), 'x', 'utf8');
  assert.throws(
    () => withLedgerLock(root, () => 'never', { timeoutMs: 60 }),
    (e) => e.code === 'ELEDGERBUSY'
  );
});
