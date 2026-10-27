import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { runInstall, detectConflict } from '../install.mjs';
import { EXIT } from '../lib/runtime-filenames.mjs';

const ROOT = path.resolve(import.meta.dirname, '..', '..');

function prep() {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'helm-conf-'));
  return { base, home: path.join(base, 'home'), dest: path.join(base, '.claude') };
}

test('有 HELM 产物但无清单 → CONFLICT(4)', () => {
  const box = prep();
  fs.mkdirSync(path.join(box.dest, 'templates'), { recursive: true });
  fs.writeFileSync(path.join(box.dest, 'templates', 'log.md'), 'old\n');
  const result = runInstall({ target: 'claude', agentDir: box.dest, homeDir: box.home, sourceDir: ROOT, cwd: box.base, json: true });
  assert.equal(result.exit, EXIT.CONFLICT, JSON.stringify(result));
});

test('detectConflict 只认 HELM 自己的标记', () => {
  const box = prep();
  fs.mkdirSync(path.join(box.dest, 'skills'), { recursive: true });
  fs.mkdirSync(path.join(box.dest, 'skills', 'user-skill'), { recursive: true });
  const host = { commandDir: 'commands/helm', cluster: 'helm' };
  assert.equal(detectConflict(box.dest, null, host), null, '用户自建 skills 不应判为冲突');
  fs.mkdirSync(path.join(box.dest, 'skills', 'helm-workflow-router'), { recursive: true });
  assert.deepEqual(detectConflict(box.dest, null, host), ['skills']);
});

test('--force 纳管后不删既有文件', () => {
  const box = prep();
  fs.mkdirSync(path.join(box.dest, 'templates'), { recursive: true });
  fs.writeFileSync(path.join(box.dest, 'templates', 'user.md'), 'mine\n');
  const result = runInstall({
    target: 'claude',
    agentDir: box.dest,
    homeDir: box.home,
    sourceDir: ROOT,
    cwd: box.base,
    json: true,
    force: true
  });
  assert.equal(result.exit, EXIT.OK, JSON.stringify(result));
  assert.equal(fs.readFileSync(path.join(box.dest, 'templates', 'user.md'), 'utf8'), 'mine\n');
  assert.ok(fs.existsSync(path.join(box.dest, '.helm-version')));
});

test('重复安装是幂等的（第二次仍 OK）', () => {
  const box = prep();
  const first = runInstall({ target: 'claude', agentDir: box.dest, homeDir: box.home, sourceDir: ROOT, cwd: box.base, json: true });
  assert.equal(first.exit, EXIT.OK);
  const second = runInstall({ target: 'claude', agentDir: box.dest, homeDir: box.home, sourceDir: ROOT, cwd: box.base, json: true });
  assert.equal(second.exit, EXIT.OK, JSON.stringify(second));
  assert.equal(second.results[0].orphans_removed, 0);
});
