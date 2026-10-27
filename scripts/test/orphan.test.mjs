import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { cleanupOrphans, writeManifest, readManifest } from '../lib/manifest.mjs';

function tmp() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'helm-orphan-'));
}

test('上一版有、这一版没有的条目被删；用户自建文件不动', () => {
  const dest = tmp();
  const prev = {
    version: '0.1.0',
    layout: 'helm-home-v2',
    managed_dirs: ['skills/helm-workflow-old'],
    managed_files: ['templates/old.md', 'agents/implementer.md']
  };
  fs.mkdirSync(path.join(dest, 'skills/helm-workflow-old'), { recursive: true });
  fs.writeFileSync(path.join(dest, 'skills/helm-workflow-old/SKILL.md'), '# old\n');
  fs.mkdirSync(path.join(dest, 'templates'), { recursive: true });
  fs.writeFileSync(path.join(dest, 'templates/old.md'), 'old\n');
  fs.mkdirSync(path.join(dest, 'agents'), { recursive: true });
  fs.writeFileSync(path.join(dest, 'agents/implementer.md'), 'keep\n');
  fs.writeFileSync(path.join(dest, 'user-note.md'), 'mine\n');
  writeManifest(dest, prev);

  const next = [
    { rel: 'skills/helm-workflow-new', isDir: true },
    { rel: 'agents/implementer.md', isDir: false }
  ];
  const removed = cleanupOrphans(dest, readManifest(dest), next);

  assert.deepEqual(removed.sort(), ['skills/helm-workflow-old', 'templates/old.md'].sort());
  assert.equal(fs.existsSync(path.join(dest, 'skills/helm-workflow-old')), false);
  assert.equal(fs.existsSync(path.join(dest, 'templates/old.md')), false);
  assert.equal(fs.readFileSync(path.join(dest, 'agents/implementer.md'), 'utf8'), 'keep\n');
  assert.equal(fs.readFileSync(path.join(dest, 'user-note.md'), 'utf8'), 'mine\n');
});

test('dry-run 只报告不删除', () => {
  const dest = tmp();
  fs.mkdirSync(path.join(dest, 'templates'), { recursive: true });
  fs.writeFileSync(path.join(dest, 'templates/old.md'), 'old\n');
  writeManifest(dest, { layout: 'helm-home-v2', managed_files: ['templates/old.md'], managed_dirs: [] });
  const removed = cleanupOrphans(dest, readManifest(dest), [], { dryRun: true });
  assert.deepEqual(removed, ['templates/old.md']);
  assert.ok(fs.existsSync(path.join(dest, 'templates/old.md')));
});

test('无上一版清单时不做任何删除', () => {
  const dest = tmp();
  fs.writeFileSync(path.join(dest, 'x.md'), 'x\n');
  assert.deepEqual(cleanupOrphans(dest, null, []), []);
  assert.ok(fs.existsSync(path.join(dest, 'x.md')));
});
