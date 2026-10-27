# 安装与升级

> 本文面向**使用 HELM 的业务项目**。源仓协作见 `AGENTS.md`。
> 命令细节以 `scripts/cli.mjs` 与 `scripts/install.mjs` 的 `--help` 为准。

## 1. 前置条件

| 项 | 要求 |
| --- | --- |
| Node.js | ≥ 20.19（`node --version`） |
| git | 任意近期版本 |
| 支持的宿主 | 可装（`ready`）：Claude / ZCode(`.agents`) / Cursor / OpenCode / Codex / Copilot(VS Code)。未发布（`planned`）：CodeBuddy / Windsurf / Cline / Roo / Continue / Zed / Junie / Aider |

支持的系统：Windows、Linux、macOS。三个平台共用同一套 CLI（`node scripts/cli.mjs`）；一键脚本分两套，Windows 用 `install.ps1`，Linux 与 macOS 用 `install.sh`，后者需要外部依赖 `curl` 与 `unzip`，三者都要求 Node.js ≥ 20.19。

Windows 侧的 `install.ps1` 只用 PowerShell 自带的 `Invoke-WebRequest` 与 `Expand-Archive`，不需要额外安装下载或解压工具。

## 2. 安装

当前版本**不通过 npm 分发**，安装方式是克隆仓库后以源目录模式运行内置 CLI。下文用 `helm-workflow` 代指 `node ~/workflow/helm-workflow/scripts/cli.mjs`，两者完全等价；按 2.2 把它加成全局命令后即可直接照抄。

下文把源仓放在 `~/workflow/helm-workflow`，这个位置只是示例。宿主只自动加载自己的配置目录，源仓放在哪里不影响加载结果，替换时保持各条命令里的路径一致即可。

### 2.1 克隆与项目内安装（推荐）

```bash
# 只做一次：克隆到仓库之外的位置
git clone https://github.com/Harry-Hz-Zhang/helm-workflow.git ~/workflow/helm-workflow

# 进入要使用 HELM 的业务项目
cd /path/to/your-project
node ~/workflow/helm-workflow/scripts/cli.mjs install \
  --source-dir ~/workflow/helm-workflow --target claude --yes
```

装到当前项目的 `.claude/`，等价于 `--location local`。`--source-dir` 表示使用本地这份仓库，不联网下载。

### 2.2 把 CLI 加成全局命令（可选）

`scripts/cli.mjs` 自带可执行位，直接软链进 `PATH` 即可：

```bash
sudo ln -sf ~/workflow/helm-workflow/scripts/cli.mjs /usr/local/bin/helm-workflow
helm-workflow check --target claude
```

之后本文所有 `helm-workflow <命令>` 都可以直接照抄。

### 2.3 全局安装（装到用户级宿主目录）

```bash
helm-workflow install --source-dir ~/workflow/helm-workflow \
  --target claude --location global --yes
```

装到用户级宿主目录（如 `~/.claude/`）。

### 2.4 一键脚本

```bash
# 在业务项目目录里执行；脚本探测 Node 版本后转交给 CLI
~/workflow/helm-workflow/install.sh --target claude --yes
```

### 2.5 自包含安装（不依赖 `~/.helm`）

```bash
helm-workflow install --source-dir ~/workflow/helm-workflow \
  --target claude --no-home --yes
```

默认模式把文件以符号链接指向 `~/.helm/payload`；`--no-home` 改为真实复制，装出来的宿主目录可整体拷走，代价是每个项目各存一份。

## 3. 宿主对照表

| 宿主 | `--target` | 命令目录 | 调用风格 |
| --- | --- | --- | --- |
| Claude Code | `claude` | `<AGENT_DIR>/commands/helm/` | `/helm:apply` |
| ZCode（`.agents`） | `agents` | `<AGENT_DIR>/commands/helm/` | `/helm:apply` |
| Cursor | `cursor` | `<AGENT_DIR>/commands/`（扁平 `helm-*.md`）+ `rules/helm-core.mdc` | `/helm-apply` |
| OpenCode | `opencode` | `<AGENT_DIR>/commands/`（扁平） | `/helm-apply` |
| Codex | `codex` | `<AGENT_DIR>/workflow/` | 自然语言「run helm apply」 |
| GitHub Copilot（VS Code） | `copilot-vscode` | `<AGENT_DIR>/prompts/`（`helm-*.prompt.md`）+ `instructions/helm-core.instructions.md` | `/helm-apply`（Prompt 面板） |
| CodeBuddy | `codebuddy`（`planned`，暂不可装） | `<AGENT_DIR>/commands/helm/` | `/helm:apply` |
| Windsurf | `windsurf`（`planned`） | `<AGENT_DIR>/workflows/` | `/helm-apply` |
| Cline | `cline`（`planned`） | `<AGENT_DIR>/workflows/` | `/helm-apply` |
| Roo Code | `roo`（`planned`） | `<AGENT_DIR>/commands/` | `/helm-apply` |
| Continue | `continue`（`planned`） | `<AGENT_DIR>/prompts/`（`.prompt`） | `/helm-apply` |
| Zed | `zed`（`planned`） | `<AGENT_DIR>/commands/` | 自然语言 |
| JetBrains AI / Junie | `jetbrains-junie`（`planned`） | `<AGENT_DIR>/commands/` | `/helm-apply` |
| Aider | `aider`（`planned`） | 宿主根（`helm-*.md`，靠 `--read` 注入） | 自然语言 |

`planned` 宿主执行 `install --target <key>` 会**以退出码 2 拒绝**，不会写入任何半成品。
`--target all` 只展开 `status: ready` 的宿主，当前 6 个：`claude` / `agents` / `cursor` / `opencode` / `codex` / `copilot-vscode`。

## 3.1 命令清单（每个 ready 宿主都是全套 13 个）

| 命令 | 作用 |
| --- | --- |
| `init` | 初始化工作台与目录骨架 |
| `new` | 把新需求收编进 feature 容器 |
| `explore` | 决策树穷举与方案探索 |
| `propose` | 产出 OpenSpec 提案与规格 |
| `apply` | 按 task 串行实施（严格模式） |
| `apply-sprint` | 可中断恢复的冲刺式实施 |
| `fix` | 针对评审/验证问题的定向修复 |
| `verify` | 实施后验证与规格覆盖核对 |
| `code-review` | 静态代码审查并产出 Markdown 报告（不改代码、不联网） |
| `commit-impact` | 影响面分析与可执行测试清单（产出 Markdown 报告） |
| `archive` | 归档 change 并收尾分支 |
| `status` | 查看 change 进度与下一步 |
| `auto` | 带闸门的端到端编排 |

`code-review` 与 `commit-impact` 的唯一交付物是**一份落盘的 Markdown 报告**：

| 命令 | 报告落点（优先） | 报告落点（无活动 change 时） |
| --- | --- | --- |
| `code-review` | `<change_root>/<change>/code-review-<YYYY-MM-DD>.md` | `<root>/reviews/code-review-<date>-<HHmm>.md` |
| `commit-impact` | `<change_root>/<change>/commit-impact-<YYYY-MM-DD>.md` | `<root>/reviews/commit-impact-<date>-<HHmm>.md` |

## 4. 安装后校验

```bash
helm-workflow check --target claude
helm-workflow check --target claude --json
```

校验项：

1. `.helm-version` 清单存在且字段完整
2. payload skill 全部到位（前缀 ∪ 白名单）
3. `templates/` 与 `references/` 到位
4. 该宿主的 `checks` 清单全部存在
5. `helm-workflow.local.example.yaml` 存在
6. 清单中的 `managed_dirs` 每一项真实存在，`managed_files` 每一项真实存在

任一项 FAIL → 退出码非 0，输出缺失路径。

## 5. 配置

首次安装会从 `helm-workflow.local.example.yaml` 创建 `helm-workflow.local.yaml`；**已存在则保留不覆盖**。

| 键 | 默认 | 取值 | 消费位置 |
| --- | --- | --- | --- |
| `apply_mode` | `strict` | `turbo` / `strict` | **change 级** `.helm-state.yaml` 键（`propose` 询问后落盘；不是本文件的键）。`apply` 派生五旗标，`git-discipline` 据此提交 |
| `auto_commit` | `false` | bool | `git-discipline`（仅 strict 下作为 `effectiveAutoCommit` 取值） |
| `commit_message_guidance` | `""` | 文本 | `implementer` / commit gate |
| `feature_date_granularity` | `YYYY` | `YYYY` / `YYYYMM` / `none` | `new` |
| `codegraph_init` | `true` | bool | `init` |
| `clone_max_concurrency` | `2` | 正整数 | `init` |
| `clone_depth` | `1` | 正整数（0 = 全量） | `init` |
| `explore_max_concurrency` | `5` | 正整数 | `explore` |
| `codegraph_max_concurrency` | `2` | 正整数 | `init` |

## 6. 升级

```bash
helm-workflow install --target <host> --yes     # 幂等，重复执行即升级
helm-workflow check --target <host>
```

升级行为：

- 保留 `helm-workflow.local.yaml`（用户配置不覆盖）
- 刷新 `helm-workflow.local.example.yaml`
- 删除上一版清单中已退役的受管 skill（孤儿清理）
- 不动用户自建的非受管目录与文件（`agents/README.md` 不在 `managed_files` 中）

### 从「手工复制」升级

若宿主目录里已有手工复制的 `skills/helm-workflow-*` 但没有 `.helm-version`：

1. 安装器检测到旧式安装 → 打印「检测到旧式手工安装，将纳管」
2. 写入清单，**不删除任何文件**
3. 之后可正常 `uninstall`

### `auto_commit` 迁移（BREAKING）

| 旧 | 新 | 效果 |
| --- | --- | --- |
| `auto_commit: true` | `apply_mode: strict` + `auto_commit: true` | 与旧行为**一致**（每 task commit） |
| `auto_commit: true` | `apply_mode: turbo` | **变化**：turbo 强制零 per-task commit |
| `auto_commit: false` | 任意 `apply_mode` | 与旧行为一致（不 commit） |

## 7. 卸载

```bash
helm-workflow uninstall --target <host> --yes
```

- **顺序固定**：先摘除宿主配置中的 hooks 引用 → 再删受管文件（避免宿主锁死）
- 只删清单中的 `managed_dirs` / `managed_files`
- 保留用户自建目录与 `helm-workflow.local.yaml`
- 若无 `.helm-version`：**拒绝递归删除**，只输出提示

## 8. 故障排查

| 现象 | 原因 | 处理 |
| --- | --- | --- |
| `helm-workflow check` 报缺 skill | payload 白名单漏登记 | 检查 `scripts/payload-skills.json` |
| 命令列表不出现 `/helm:*` | 宿主未重启 / 目录层级不对 | 确认 `--target` 与宿主实际目录一致，重启宿主 |
| 卸载后宿主报错找不到脚本 | 配置残留（hooks 未先摘） | 重新 `install` 再 `uninstall`，或手工清理残留条目 |
| 中文显示乱码 | 文件被按 ANSI 读写 | 确认文件为 UTF-8 无 BOM |
| `check` 报 `managed_files` 缺失 | `agents/README.md` 被误当 persona 分发 | 生成 plan 时排除 `agents/README.md` |

## 9. 版本

当前版本见 `package.json#version`；变更见 `CHANGELOG.md`。
