import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { collectNetGuardFiles, NET_GUARD_SKIP } from '../verify.mjs';

const ROOT = path.resolve(import.meta.dirname, '..', '..');

test('扫描集的来源是 git 索引，覆盖全部已跟踪文件', () => {
  const scan = collectNetGuardFiles(ROOT);
  assert.equal(scan.basis, 'git', '本测试必须在 git 仓库内运行，否则覆盖度断言没有意义');

  const tracked = execFileSync('git', ['ls-files', '-z'], { cwd: ROOT, encoding: 'utf8' })
    .split('\0')
    .filter(Boolean);
  const scanned = new Set(scan.files);
  const binary = new Set(scan.binary);
  const missing = tracked.filter((rel) => !scanned.has(rel) && !binary.has(rel) && !NET_GUARD_SKIP.has(rel));

  assert.deepEqual(missing, [], `以下已跟踪文件没有进入扫描集：${missing.join(', ')}`);
  assert.deepEqual(
    tracked.filter((rel) => !scanned.has(rel) && !binary.has(rel)).sort(),
    [...NET_GUARD_SKIP].filter((rel) => tracked.includes(rel)).sort(),
    '未被扫描的文本文件必须恰好等于豁免名单'
  );
});

test('豁免名单里的文件不在扫描集内', () => {
  const scan = collectNetGuardFiles(ROOT);
  const scanned = new Set(scan.files);
  for (const rel of NET_GUARD_SKIP) {
    assert.equal(scanned.has(rel), false, `豁免文件不应被自己扫描：${rel}`);
  }
});

test('无扩展名文件也在扫描集内', () => {
  // LICENSE 与 .gitignore 没有扩展名，按扩展名枚举的旧实现会整类漏掉
  const scan = collectNetGuardFiles(ROOT);
  const scanned = new Set(scan.files);
  for (const rel of ['LICENSE', '.gitignore']) {
    if (!fs.existsSync(path.join(ROOT, rel))) continue;
    assert.equal(scanned.has(rel), true, `无扩展名文件应被扫描：${rel}`);
  }
});

test('新增目录与无扩展名文件不会被漏掉', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'helm-scan-'));
  try {
    execFileSync('git', ['init', '-q'], { cwd: tmp });
    fs.mkdirSync(path.join(tmp, 'docs'), { recursive: true });
    fs.writeFileSync(path.join(tmp, 'docs', 'note.md'), '# note\n');
    fs.writeFileSync(path.join(tmp, 'Dockerfile'), 'FROM node:20\n');
    fs.writeFileSync(path.join(tmp, 'LICENSE'), 'MIT\n');
    execFileSync('git', ['add', '-A'], { cwd: tmp });

    const scan = collectNetGuardFiles(tmp);
    assert.equal(scan.basis, 'git');
    for (const rel of ['docs/note.md', 'Dockerfile', 'LICENSE']) {
      assert.equal(scan.files.includes(rel), true, `新目录/无扩展名文件应进入扫描集：${rel}`);
    }
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('含 NUL 字节的文件被判为二进制并跳过', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'helm-scan-bin-'));
  try {
    execFileSync('git', ['init', '-q'], { cwd: tmp });
    fs.writeFileSync(path.join(tmp, 'text.txt'), 'plain text\n');
    fs.writeFileSync(path.join(tmp, 'blob.bin'), Buffer.from([0x50, 0x00, 0x4e, 0x47]));
    execFileSync('git', ['add', '-A'], { cwd: tmp });

    const scan = collectNetGuardFiles(tmp);
    assert.equal(scan.files.includes('text.txt'), true);
    assert.equal(scan.files.includes('blob.bin'), false, '含 NUL 的文件应被排除');
    assert.equal(scan.binary.includes('blob.bin'), true);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('读取失败的文件进 unreadable，不会被静默当成文本或二进制', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'helm-scan-miss-'));
  try {
    execFileSync('git', ['init', '-q'], { cwd: tmp });
    fs.writeFileSync(path.join(tmp, 'gone.txt'), 'x\n');
    execFileSync('git', ['add', '-A'], { cwd: tmp });
    fs.rmSync(path.join(tmp, 'gone.txt'));

    const scan = collectNetGuardFiles(tmp);
    assert.deepEqual(scan.unreadable, ['gone.txt']);
    assert.equal(scan.files.includes('gone.txt'), false);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('二进制探测不依赖扩展名', () => {
  // 扩展名为 .md 的文件里含 NUL 也必须按二进制处理，否则会按 UTF-8 读出乱码后漏判
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'helm-scan-ext-'));
  try {
    execFileSync('git', ['init', '-q'], { cwd: tmp });
    fs.writeFileSync(path.join(tmp, 'weird.md'), Buffer.from([0x23, 0x00, 0x61, 0x62]));
    execFileSync('git', ['add', '-A'], { cwd: tmp });

    const scan = collectNetGuardFiles(tmp);
    assert.equal(scan.binary.includes('weird.md'), true);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});
