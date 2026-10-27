#!/usr/bin/env sh
# HELM 一键安装（POSIX sh，不依赖 bash 扩展）
# 设计：不单独实现 bootstrap.mjs，下载 / 解压 / Node 探测都在本脚本内完成（D-15.1）。
# 唯一保留的离线通道：--source-dir，直接跳过下载。
set -eu

EXIT_OK=0
EXIT_ARG=2
EXIT_SOURCE=3
EXIT_NETWORK=6
EXIT_IO=5
EXIT_BOOTSTRAP_ARCHIVE=30
EXIT_BOOTSTRAP_NODE=31

SOURCE_DIR=""
TARGET="auto"
YES=0
LOCATION="local"
DRY_RUN=0
HOME_DIR=""
REF="${HELM_REF:-}"
ARCHIVE_URL="${HELM_ARCHIVE_URL:-}"

usage() {
  cat <<'EOF'
用法：install.sh [选项]

  --source-dir <dir>   离线模式：直接用已有源仓，跳过下载
  --target <spec>      宿主名 / 逗号列表 / auto / all（默认 auto）
  --location <loc>     local（默认）| global
  --home <dir>         共享真源根（默认 ~/.helm）
  --ref <ref>          记录 git ref
  --dry-run            零副作用
  -y, --yes            跳过确认
  -h, --help           显示本帮助

退出码：0 OK / 2 ARG / 3 SOURCE / 5 IO / 6 NETWORK / 30 归档非法 / 31 Node 版本不足
EOF
}

while [ $# -gt 0 ]; do
  case "$1" in
    --source-dir) SOURCE_DIR="${2:-}"; shift 2 ;;
    --target|-t) TARGET="${2:-}"; shift 2 ;;
    --location) LOCATION="${2:-}"; shift 2 ;;
    --home) HOME_DIR="${2:-}"; shift 2 ;;
    --ref) REF="${2:-}"; shift 2 ;;
    --dry-run) DRY_RUN=1; shift ;;
    -y|--yes) YES=1; shift ;;
    -h|--help) usage; exit $EXIT_OK ;;
    *) echo "[helm-install] 未知参数: $1" >&2; usage >&2; exit $EXIT_ARG ;;
  esac
done

say() { printf '[helm-install] %s\n' "$*"; }
die() { code="$1"; shift; printf '[helm-install] %s\n' "$*" >&2; exit "$code"; }

# ---- 1. Node 探测（>= 20.19）----
need_node() {
  command -v node >/dev/null 2>&1 || die $EXIT_BOOTSTRAP_NODE "未找到 node（需要 >= 20.19）"
  ver="$(node -p 'process.versions.node' 2>/dev/null || echo 0.0.0)"
  major="${ver%%.*}"
  rest="${ver#*.}"
  minor="${rest%%.*}"
  if [ "$major" -lt 20 ] || { [ "$major" -eq 20 ] && [ "$minor" -lt 19 ]; }; then
    die $EXIT_BOOTSTRAP_NODE "node 版本过低：$ver（需要 >= 20.19）"
  fi
}

# ---- 2. 定位源仓 ----
resolve_source() {
  if [ -n "$SOURCE_DIR" ]; then
    [ -f "$SOURCE_DIR/package.json" ] || die $EXIT_SOURCE "源目录不完整：$SOURCE_DIR"
    printf '%s' "$SOURCE_DIR"
    return 0
  fi
  script_dir="$(cd "$(dirname "$0")" && pwd)"
  if [ -f "$script_dir/package.json" ]; then
    printf '%s' "$script_dir"
    return 0
  fi
  [ -n "$ARCHIVE_URL" ] || die $EXIT_NETWORK "未指定 --source-dir，且未设置 HELM_ARCHIVE_URL（CLI 不联网）"
  tmp="${TMPDIR:-/tmp}/helm-install-$$"
  mkdir -p "$tmp"
  archive="$tmp/helm.zip"
  command -v curl >/dev/null 2>&1 || die $EXIT_NETWORK "未找到 curl"
  curl -fsSL "$ARCHIVE_URL" -o "$archive" || die $EXIT_NETWORK "下载失败：$ARCHIVE_URL"
  check_archive "$archive"
  command -v unzip >/dev/null 2>&1 || die $EXIT_IO "未找到 unzip"
  unzip -q "$archive" -d "$tmp" || die $EXIT_IO "解压失败"
  found="$(find "$tmp" -maxdepth 2 -name package.json -print 2>/dev/null | head -n 1)"
  [ -n "$found" ] || die $EXIT_SOURCE "归档内找不到 package.json"
  printf '%s' "$(dirname "$found")"
}

# ---- 3. 归档头校验：非 ZIP 首字节直接 30 ----
check_archive() {
  file="$1"
  [ -s "$file" ] || die $EXIT_BOOTSTRAP_ARCHIVE "归档为空：$file"
  magic="$(dd if="$file" bs=1 count=4 2>/dev/null | od -An -tx1 | tr -d ' \n')"
  if [ "$magic" != "504b0304" ] && [ "$magic" != "504b0506" ]; then
    die $EXIT_BOOTSTRAP_ARCHIVE "首字节不是 ZIP（$magic）：$file"
  fi
}

need_node
SRC="$(resolve_source)"
say "源目录：$SRC"

# ---- 4. 交给 CLI（bootstrap 全程只做探测 + 转发）----
set -- install --source-dir "$SRC" --target "$TARGET" --location "$LOCATION"
if [ -n "$HOME_DIR" ]; then set -- "$@" --home "$HOME_DIR"; fi
if [ -n "$REF" ]; then set -- "$@" --ref "$REF"; fi
if [ "$DRY_RUN" -eq 1 ]; then set -- "$@" --dry-run; fi
if [ "$YES" -eq 1 ]; then set -- "$@" --yes; fi

set +e
node "$SRC/scripts/cli.mjs" "$@"
code=$?
set -e

# ---- 5. HELM_INSTALL_JSON：把结果落成机读文件（CI 用）----
if [ -n "${HELM_INSTALL_JSON:-}" ]; then
  printf '{"exit":%s,"source":"%s","target":"%s"}\n' "$code" "$SRC" "$TARGET" > "$HELM_INSTALL_JSON" 2>/dev/null \
    || say "警告：无法写入 HELM_INSTALL_JSON=$HELM_INSTALL_JSON"
fi

exit "$code"
