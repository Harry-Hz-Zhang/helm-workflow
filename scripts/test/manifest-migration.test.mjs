import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  migrateManifest,
  readManifest,
  readManifestStrict,
  writeManifest,
  restoreManifest
} from '../lib/manifest.mjs';
import { runInstall } from '../install.mjs';
import { runCheck } from '../install-check.mjs';

const ROOT = path.resolve(import.meta.dirname, '..', '..');

test('v1 清单读入后字段补全（内存迁移，不写盘）', () => {
  const raw = { version: '0.1.0', source_dir: '/x/helm', managed_files: ['a.md'] };
  const migrated = migrateManifest(raw);
  assert.equal(migrated.layout, 'helm-copy-v1');
  assert.equal(migrated.migrated_from, 'helm-copy-v1');
  assert.equal(migrated.link_mode, 'copy');
  assert.deepEqual(migrated.managed_dirs, []);
  assert.deepEqual(migrated.managed_files, ['a.md']);
  assert.equal(migrated.install_location, 'local');
  assert.equal(raw.layout, undefined, '迁移不得修改入参');
});

test('null / 非对象返回 null', () => {
  assert.equal(migrateManifest(null), null);
  assert.equal(migrateManifest('x'), null);
});

test('check 不写盘', () => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'helm-mig-'));
  const home = path.join(base, 'home');
  const dest = path.join(base, '.claude');
  assert.equal(runInstall({ target: 'claude', agentDir: dest, homeDir: home, sourceDir: ROOT, json: true }).exit, 0);
  const file = path.join(dest, '.helm-version');
  fs.writeFileSync(file, JSON.stringify({ version: '0.1.0', layout: 'helm-copy-v1', managed_files: [], managed_dirs: [] }), 'utf8');
  const before = fs.readFileSync(file, 'utf8');
  runCheck({ agentDir: dest, homeDir: home, json: true });
  assert.equal(fs.readFileSync(file, 'utf8'), before);
});

test('writeManifest 生成 .bak，restoreManifest 可回滚', () => {
  const dest = fs.mkdtempSync(path.join(os.tmpdir(), 'helm-mig2-'));
  writeManifest(dest, { version: '1.0.0', layout: 'helm-home-v2' });
  writeManifest(dest, { version: '1.1.0', layout: 'helm-home-v2' });
  assert.equal(readManifest(dest).version, '1.1.0');
  assert.ok(fs.existsSync(path.join(dest, '.helm-version.bak')));
  assert.equal(restoreManifest(dest), true);
  assert.equal(readManifest(dest).version, '1.0.0');
});

test('readManifestStrict 对非法 JSON 给出 error', () => {
  const dest = fs.mkdtempSync(path.join(os.tmpdir(), 'helm-mig3-'));
  fs.writeFileSync(path.join(dest, '.helm-version'), '{oops', 'utf8');
  const probe = readManifestStrict(dest);
  assert.match(probe.error, /JSON 非法/);
});
