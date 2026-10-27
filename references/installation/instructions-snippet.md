# HELM 安装指引片段

> 把本片段整段并入你的宿主规则文件（`CLAUDE.md` / `AGENTS.md` / `<AGENT_DIR>/rules/*.mdc`）。
> 路径一律相对仓库根或写 `<AGENT_DIR>` 占位，不得改写成本机绝对路径。

## 1. 安装

示例把源仓放在 `~/workflow/helm-workflow`，这个位置可替换为任意稳定目录，替换时保持各条命令里的路径一致即可。

```bash
# 只做一次：克隆到仓库之外
git clone https://github.com/Harry-Hz-Zhang/helm-workflow.git ~/workflow/helm-workflow

# 在业务项目里安装：装到当前仓库的 <AGENT_DIR>/
node ~/workflow/helm-workflow/scripts/cli.mjs install \
  --source-dir ~/workflow/helm-workflow --target auto --yes

# 明确指定宿主；auto 由探测决定，all 展开全部 ready 宿主
node ~/workflow/helm-workflow/scripts/cli.mjs install \
  --source-dir ~/workflow/helm-workflow --target cursor,claude --yes
```

`--target` 三档写死：`auto`（三级探测当前仓库有哪些宿主）、`all`（展开全部 `status: ready` 的宿主）、`<列表>`（逗号分隔的宿主 key，如 `claude,cursor`）。

下文命令统一写作 `helm-workflow <子命令>`，它等价于 `node ~/workflow/helm-workflow/scripts/cli.mjs <子命令>`。想直接用短命令，把该文件软链进 `PATH` 即可（它自带可执行位）：

```bash
sudo ln -sf ~/workflow/helm-workflow/scripts/cli.mjs /usr/local/bin/helm-workflow
```

## 2. 校验

```bash
helm-workflow check --target auto          # 逐项校验 managed_dirs / managed_files
helm-workflow check --target all --json    # 机器可读结果；ok=false 时退出码非 0
helm-workflow doctor                       # 环境自检：node 版本、目录权限、链接能力
helm-workflow list                         # 本次安装的受管文件清单
helm-workflow installations                # 历次安装账本（~/.helm/installations.json）
helm-workflow version                      # 版本与 commit
helm-workflow upgrade --all                # 拉新版本 payload，保留 helm-workflow.local.yaml
helm-workflow help                         # 九命令速查
```

校验不通过时按顺序读三处：`<AGENT_DIR>/.helm-version`（清单）、`scripts/hosts.json`（宿主声明）、`helm-workflow.local.yaml`（本机配置）。

## 3. 卸载

```bash
helm-workflow uninstall --target auto --yes     # 只删清单内的受管文件
helm-workflow uninstall --target cursor --json  # 输出 kept：用户自建文件清单
```

顺序固定：先摘除宿主配置中的 hooks 引用，再删受管文件。`helm-workflow.local.yaml` 与用户自建文件一律保留，并在 `kept` 中列出。
