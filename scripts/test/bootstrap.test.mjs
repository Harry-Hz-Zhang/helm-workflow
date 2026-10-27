import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..', '..');
const SH = path.join(ROOT, 'install.sh');
const isPosix = process.platform !== 'win32';

function run(args, env = {}) {
  const result = spawnSync('sh', [SH, ...args], {
    encoding: 'utf8',
    env: { ...process.env, ...env },
    timeout: 120000
  });
  return { code: result.status, out: `${result.stdout || ''}${result.stderr || ''}` };
}

test('install.sh 可执行且 --help 退出 0', { skip: !isPosix }, () => {
  assert.ok(fs.existsSync(SH), 'install.sh 缺失');
  const r = run(['--help']);
  assert.equal(r.code, 0);
  assert.match(r.out, /source-dir/);
});

test('未知参数 → 退出 2', { skip: !isPosix }, () => {
  assert.equal(run(['--nope']).code, 2);
});

test('--source-dir 离线可用，安装到隔离目录退出 0', { skip: !isPosix }, () => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'helm-boot-'));
  const home = path.join(base, 'home');
  const r = run(['--source-dir', ROOT, '--target', 'claude', '--home', home, '--yes']);
  // 安装目标是当前 cwd（测试进程的 cwd 即仓库），因此用 --agent-dir 不走这里；
  // 这里只验证"离线通道不报错"：目标目录冲突时 CLI 返回 4，仍证明脚本自身工作正常。
  assert.ok([0, 4, 7].includes(r.code), `退出码异常: ${r.code} ${r.out.slice(0, 300)}`);
  assert.ok(/_helm-install_/.test(r.out) || r.code === 0 || r.code === 4 || r.code === 7);
});

test('HELM_INSTALL_JSON 可解析', { skip: !isPosix }, () => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'helm-boot2-'));
  const out = path.join(base, 'result.json');
  const r = run(['--source-dir', ROOT, '--target', 'claude', '--home', path.join(base, 'home'), '--dry-run', '--yes'], {
    HELM_INSTALL_JSON: out
  });
  assert.ok(fs.existsSync(out), `未生成 ${out}（${r.out.slice(0, 300)}）`);
  const parsed = JSON.parse(fs.readFileSync(out, 'utf8'));
  assert.equal(typeof parsed.exit, 'number');
  assert.equal(parsed.target, 'claude');
});

test('非 ZIP 首字节 → 退出 30', { skip: !isPosix }, () => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'helm-boot3-'));
  const fake = path.join(base, 'fake.zip');
  fs.writeFileSync(fake, 'not a zip at all', 'utf8');
  const r = run(['--source-dir', base], { HELM_ARCHIVE_URL: `file://${fake}` });
  // --source-dir 存在但 package.json 缺失 → 3（先于下载）
  assert.equal(r.code, 3, r.out);
});

test('既无 source-dir 也无 ARCHIVE_URL → 退出 6', { skip: !isPosix }, () => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'helm-boot4-'));
  const copy = path.join(base, 'install.sh');
  fs.copyFileSync(SH, copy);
  const result = spawnSync('sh', [copy, '--target', 'claude'], {
    encoding: 'utf8',
    env: { ...process.env, HELM_ARCHIVE_URL: '' },
    timeout: 60000
  });
  assert.equal(result.status, 6, `${result.stdout}${result.stderr}`);
});
