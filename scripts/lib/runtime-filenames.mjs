export const VERSION_FILE = '.helm-version';
export const VERSION_BACKUP = '.helm-version.bak';
export const LOCAL_YAML = 'helm-workflow.local.yaml';
export const LOCAL_EXAMPLE = 'helm-workflow.local.example.yaml';
export const STATE_FILE = '.helm-state.yaml';
export const LOG_FILE = 'log.md';

export const RUNTIME_DIR = '.helm-runtime';
export const RUNTIME_UNINSTALL = 'uninstall.mjs';
export const HOSTS_SNAPSHOT = 'hosts.snapshot.json';

export const LEDGER_FILENAME = 'installations.json';
export const LEDGER_LOCK = 'installations.lock';

export const PAYLOAD_META = 'payload.json';

/** v1 manifest（纯 copy、source_dir 即真源） */
export const LAYOUT_V1 = 'helm-copy-v1';
/** v2 manifest（home 真源 + 逐项 link/copy） */
export const LAYOUT_V2 = 'helm-home-v2';

/** 退出码契约：全仓库唯一来源 */
export const EXIT = Object.freeze({
  OK: 0,
  CHECK: 1,
  ARG: 2,
  SOURCE: 3,
  CONFLICT: 4,
  IO: 5,
  NETWORK: 6,
  PARTIAL: 7,
  BUSY: 8
});

export const EXIT_LABEL = Object.freeze({
  0: 'OK',
  1: 'CHECK_FAILED',
  2: 'ARG',
  3: 'SOURCE_INCOMPLETE',
  4: 'CONFLICT',
  5: 'IO_ERROR',
  6: 'NETWORK',
  7: 'PARTIAL',
  8: 'BUSY'
});

/** 需要随宿主一起落盘的运行时文件（相对 scripts/） */
export const RUNTIME_FILES = Object.freeze([
  'uninstall.mjs',
  'lib/runtime-filenames.mjs',
  'lib/host-paths.mjs',
  'lib/host-config.mjs',
  'lib/agent-link.mjs',
  'lib/manifest.mjs',
  'lib/install-registry.mjs',
  'lib/payload-home.mjs',
  'lib/is-main.mjs'
]);
