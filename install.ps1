# HELM 一键安装（PowerShell 5.1+ / 7+）
# 与 install.sh 等价：Node 探测 → 定位源仓 → 转发给 scripts/cli.mjs
# 退出码：0 OK / 2 ARG / 3 SOURCE / 5 IO / 6 NETWORK / 30 归档非法 / 31 Node 版本不足

param(
  [string]$SourceDir = '',
  [string]$Target = 'auto',
  [string]$Location = 'local',
  [string]$Home = '',
  [string]$Ref = $env:HELM_REF,
  [switch]$DryRun,
  [switch]$Yes
)

$ErrorActionPreference = 'Stop'

function Fail([int]$Code, [string]$Message) {
  [Console]::Error.WriteLine("[helm-install] $Message")
  exit $Code
}

if ($PSBoundParameters.ContainsKey('Help')) { }

# ---- 1. Node 探测 ----
$nodeCmd = Get-Command node -ErrorAction SilentlyContinue
if (-not $nodeCmd) { Fail 31 '未找到 node（需要 >= 20.19）' }
$ver = & node -p 'process.versions.node'
$parts = $ver.Split('.')
if ([int]$parts[0] -lt 20 -or ([int]$parts[0] -eq 20 -and [int]$parts[1] -lt 19)) {
  Fail 31 "node 版本过低：$ver（需要 >= 20.19）"
}

# ---- 2. 定位源仓 ----
$src = $SourceDir
if (-not $src) {
  $scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
  if (Test-Path (Join-Path $scriptDir 'package.json')) {
    $src = $scriptDir
  } else {
    $url = $env:HELM_ARCHIVE_URL
    if (-not $url) { Fail 6 '未指定 -SourceDir，且未设置 HELM_ARCHIVE_URL（CLI 不联网）' }
    $tmp = Join-Path ([System.IO.Path]::GetTempPath()) ("helm-install-" + [Guid]::NewGuid().ToString('N'))
    New-Item -ItemType Directory -Path $tmp -Force | Out-Null
    $archive = Join-Path $tmp 'helm.zip'
    try {
      Invoke-WebRequest -Uri $url -OutFile $archive -UseBasicParsing
    } catch {
      Fail 6 "下载失败：$url"
    }
    $bytes = [System.IO.File]::ReadAllBytes($archive)
    if ($bytes.Length -lt 4 -or $bytes[0] -ne 0x50 -or $bytes[1] -ne 0x4B) {
      Fail 30 "首字节不是 ZIP：$archive"
    }
    try {
      Expand-Archive -Path $archive -DestinationPath $tmp -Force
    } catch {
      Fail 5 '解压失败'
    }
    $pkg = Get-ChildItem -Path $tmp -Filter 'package.json' -Recurse -Depth 2 | Select-Object -First 1
    if (-not $pkg) { Fail 3 '归档内找不到 package.json' }
    $src = $pkg.DirectoryName
  }
}

if (-not (Test-Path (Join-Path $src 'package.json'))) {
  Fail 3 "源目录不完整：$src"
}
[Console]::Out.WriteLine("[helm-install] 源目录：$src")

# ---- 3. 转发给 CLI ----
$cliArgs = @('install', '--source-dir', $src, '--target', $Target, '--location', $Location)
if ($Home) { $cliArgs += @('--home', $Home) }
if ($Ref) { $cliArgs += @('--ref', $Ref) }
if ($DryRun) { $cliArgs += '--dry-run' }
if ($Yes) { $cliArgs += '--yes' }

& node (Join-Path $src 'scripts/cli.mjs') @cliArgs
$code = $LASTEXITCODE

# ---- 4. 机读结果 ----
if ($env:HELM_INSTALL_JSON) {
  $payload = @{ exit = $code; source = $src; target = $Target } | ConvertTo-Json -Compress
  try {
    Set-Content -Path $env:HELM_INSTALL_JSON -Value $payload -Encoding UTF8
  } catch {
    [Console]::Out.WriteLine("[helm-install] 警告：无法写入 HELM_INSTALL_JSON=$($env:HELM_INSTALL_JSON)")
  }
}

exit $code
