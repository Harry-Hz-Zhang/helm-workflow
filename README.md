# HELM Workflow

Human-gated Engineering Lifecycle Method 

变更见 [`CHANGELOG.md`](./CHANGELOG.md)，安装与升级细节见 [`INSTALLATION.md`](./INSTALLATION.md)，源仓协作法则见 [`AGENTS.md`](./AGENTS.md)。

命令只有一个 `helm` 簇，路由真源是 `skills/helm-workflow-router/SKILL.md`：

| 簇 | 用途 | 常用入口 |
| --- | --- | --- |
| `helm` | 交付主链：工作台、需求接入、探索、提案、实现、修复、验证、归档 | `/helm:init`、`/helm:new`、`/helm:explore` → `/helm:propose` → `/helm:apply` → `/helm:verify` → `/helm:archive` |
| `helm`（旁路） | 报告与状态，不改代码 | `/helm:code-review`、`/helm:commit-impact`、`/helm:status` |
| 无 slash | 代码理解与影响分析，按意图加载 6 个 `gitnexus-*` skill | 直接在会话里问「这段代码怎么工作」「改这里会影响什么」 |

`helm-workflow-feature` 是兼容转发入口（约等于 `/helm:new`），不占用阶段编号。13 个阶段与横切 skill 的对应关系见 §4。

### 宿主与入口示例

| 宿主 | 目录 | 示例 | 备注 |
| --- | --- | --- | --- |
| Claude Code | `.claude` | `/helm:init`、`/helm:apply` | nested，入口在 `commands/helm/` |
| ZCode | `.agents` | 同上 | nested，共用 `.agents` 约定 |
| Cursor | `.cursor` | `/helm-init`、`/helm-apply` | flat，入口在 `commands/` |
| OpenCode | `.opencode` | 同 Cursor | flat，入口在 `commands/` |
| Codex | `.codex` | `workflow/helm-*.md` | 无 slash，用自然语言说「用 apply 阶段」 |
| Copilot (VS Code) | `.github` | `/helm-apply` | `prompts/` 加 `instructions/` |

`ready` 之外的 8 个宿主（`codebuddy`、`windsurf`、`cline`、`roo`、`continue`、`zed`、`jetbrains-junie`、`aider`）当前是 `planned`：指定它们会以退出码 `ARG(2)` 明确拒绝，不会装出半成品。完整字段见 `scripts/hosts.json` 与 `references/installation/hosts-config.md`。

### 分层结构

| 层 | 作用 | 路径示例 |
| --- | --- | --- |
| L3 Shell | 宿主薄入口，只声明加载哪个 skill，不含规则 | `commands/helm/apply.md`、`.cursor/commands/helm-apply.md`、`.github/prompts/helm-apply.prompt.md` |
| L2 编排 | 宿主侧 workflow 文档（Codex） | `.codex/workflow/helm-apply.md` |
| L1 Skill | 跨宿主流程正文，唯一流程权威 | `skills/helm-workflow-*/SKILL.md` |
| L0 Payload | 安装时 stage 一次的共享真源 | `~/.helm/payload/`（`shared/`、`hosts/`、`runtime/`） |

- 表面（surface）是安装到宿主目录里的那一层：默认**逐项 symlink** 指向 `~/.helm/payload`，链接不可用时自动回退 copy；`--no-link` 强制 copy，`--no-home` 完全不使用共享真源。
- 多个安装共享同一 `payload_root`，因此**子集升级会连带影响其它宿主**：默认以 `CONFLICT(4)` 拒绝，改用 `helm-workflow upgrade --all` 或加 `--force`。
- 每个宿主目录落一份 `.helm-version` 清单（`helm-copy-v1` / `helm-home-v2` 两种 layout），卸载、升级、孤儿清理全部以清单为准，不靠猜。

### 单仓与工作台

| | 单仓 | 工作台（workbench） |
| --- | --- | --- |
| 适用 | 单个业务仓库 | 多仓产品线（业务仓、文档仓等治理单元） |
| 起点 | `/helm:explore` | `/helm:init` 建台，再 `/helm:new` 接需求 |
| 代码位置 | 当前仓库 | 各业务仓；工作台仓只保留治理资产 |
| 判定 | 无 `.workbench.yaml`，且当前目录在 git 仓库内 | 当前目录或祖先目录存在 `.workbench.yaml`（向上最多 10 层） |

工作台写 `repos.manifest.yaml`（入库，描述有哪些仓、角色与分支策略）与本机 `.state/repos.links.yaml`（不入库，只描述本机路径）。**路径的唯一权威是 links 文件**：manifest 里即使出现 `repo_path` 也不作为路径来源，避免把 A 机器的路径带到 B 机器。需求落在 `features/<年>/<日期>_<中文名>/`，change 仍在 `.openspec/changes/<name>/`。

### 全链路

```text
  /helm:init  ->  /helm:new             # 可选：建台 + 需求接入
  /helm:explore  ->  /helm:propose      # 先讲清问题，再固化 artifacts
  /helm:propose  ->  HARD-GATE          # 人工确认后才进入实现
  HARD-GATE  ->  /helm:apply 或 /helm:apply-sprint
  /helm:apply  ->  /helm:verify  ->  /helm:archive
  回补路径：/helm:fix 在 apply 与 verify 之间

  旁路：/helm:code-review、/helm:commit-impact、/helm:status
  代码理解：gitnexus-* 六个 skill，无 slash，按意图加载
```

---

# 1. 安装

支持 **Windows / Linux / macOS**，三个平台共用同一套 CLI（`node scripts/cli.mjs`）；一键脚本分两套。

| 系统 | 一键脚本 | 额外依赖 |
| --- | --- | --- |
| Windows | `install.ps1` | PowerShell 自带的 `Invoke-WebRequest`、`Expand-Archive` |
| Linux | `install.sh` | `curl`、`unzip` |
| macOS | `install.sh` | `curl`、`unzip` |

前置：**Node.js ≥ 20.19**，以及 **Git**（克隆源仓、流程内的分支与 diff 操作都依赖它）。

当前版本**不通过 npm 分发**，安装方式是克隆仓库后以源目录模式运行内置 CLI。下文把源仓放在 `~/workflow/helm-workflow`，这个位置只是示例；任何稳定且不被宿主自动加载的目录都可以，替换时保持各条命令里的路径一致。

## 1.1 克隆与项目内安装（推荐）

```bash
# 1. 克隆到业务仓库之外（只做一次）
git clone https://github.com/Harry-Hz-Zhang/helm-workflow.git ~/workflow/helm-workflow

# 2. 进入要用 HELM 的业务项目，装到当前项目的 .claude/
node ~/workflow/helm-workflow/scripts/cli.mjs install \
  --source-dir ~/workflow/helm-workflow --target claude --yes

# 3. 校验
node ~/workflow/helm-workflow/scripts/cli.mjs check --target claude
```

Windows PowerShell 下把 `~` 换成本机实际路径，其余参数完全一致。

`-t` 默认 `auto`（探测当前目录已有的宿主目录），`--location` 默认 `local`（装进当前项目）。装到用户级改用 `--location global`。

## 1.2 把 CLI 加成全局命令（可选）

```bash
sudo ln -sf ~/workflow/helm-workflow/scripts/cli.mjs /usr/local/bin/helm-workflow
helm-workflow list --ready-only
```

Windows 下用 `npm link`，或把 `scripts` 目录加进 `PATH`。`package.json` 已声明 `helm-workflow` 与 `helm-wf` 两个 bin 名。

## 1.3 一键脚本

在业务项目目录里执行，脚本会探测 Node 版本后转交给 CLI：

```bash
~/workflow/helm-workflow/install.sh --target claude --yes
```

```powershell
~/workflow/helm-workflow/install.ps1 -Target claude -Yes
```

PowerShell 脚本用 PowerShell 风格参数（`-Target`、`-Yes`、`-DryRun`、`-SourceDir`、`-Location`、`-Home`），与 `scripts/cli.mjs` 的 `--target` 写法不同。

## 1.4 干跑与自检

`--dry-run` 全程零副作用：不建 `~/.helm`、不改宿主目录、不写清单。

```bash
node ~/workflow/helm-workflow/scripts/cli.mjs install --target claude --dry-run
node ~/workflow/helm-workflow/scripts/cli.mjs doctor
```

`doctor` 逐项检查 Node 版本、home 可写性、link 能力、配置文件、payload、账本与旧式安装。全局安装、自包含安装（`--no-home`）、从旧版本升级、卸载与排障见 [INSTALLATION.md](./INSTALLATION.md)。

---

# 2. 快速上手

命令写法因宿主而异：Claude Code 与 ZCode 用 `/helm:<stage>`，Cursor、OpenCode、Copilot 用 `/helm-<stage>`，Codex 没有 slash，用自然语言说阶段名。下文示例用 colon 风格，flat 宿主把 `:` 换成 `-` 即可。

**单仓**：`/helm:explore` → `/helm:propose` → 人工确认 → `/helm:apply` →（`/helm:fix`）→ `/helm:verify` → `/helm:archive`。
**工作台**：`/helm:init` → `/helm:new` → 之后与单仓相同。

## Step 0（可选）：工作台与需求接入

多仓产品线：

```text
/helm:init
/helm:new
```

- `init`：Bootstrap / Bind 多仓清单、本机 links 与 `.code-workspace`，可选跑 CodeGraph 索引；幂等，二次运行只走 Bind。
- `new`：把需求写进 `features/...`，确认前不落盘；确认后按 `00-feature.md` 的建议建分支，脏工作区硬停、不 stash。

单仓跳过本步，直接从 `/helm:explore` 开始。

## Step 1：准备输入

至少准备以下 2–3 项：

- 需求描述：目标、背景、期望结果
- 业务入口：页面路径、接口、任务或文档链接
- 相关代码位置：模块名、类名、方法名
- 验收条件：需要证明什么、用什么命令验证

## Step 2：探索问题空间（Explore）

```text
/helm:explore <change-id 或主题>
```

目标是把问题讲清楚，不写代码。产出或补齐 `exploration-handoff.md`，留下事实来源与代码锚点。

## Step 3：产出方案与任务（Propose）

```text
/helm:propose <change-id>
```

基于 explore 结论生成 `proposal.md`、`specs/`、`design.md`、`tasks.md`、`log.md` 与 `.helm-state.yaml`，并在这里确定 `complexity_mode` 与 `apply_mode`。`standard` 必须先过独立设计审查才能进入实现。

## Step 4：人工确认（HARD-GATE）

进入实现前逐项检查：`proposal` 的边界、`specs` 的行为覆盖、`design` 的调用链与风险、`tasks` 是否可独立验证、`.helm-state.yaml` 的复杂度与审查状态。确认后再 `/helm:apply`。

## Step 5：实现（Apply / Apply Sprint）

```text
/helm:apply <change-id>
/helm:apply-sprint <change-id>    # 长流程，带 checkpoint 可续跑
```

实现阶段强制 TDD、蓝方实现 / 红方复核、Reverse Sync 与 task/log/state 回写。在 `main` / `master` 上会走 Branch Confirm（硬规则，无开关可关）。是否逐 task 提交由 `auto_commit` 决定，见 §3。

## Step 6：定向修复（Fix）

```text
/helm:fix <change-id>
```

只做定向修复。事实源与代码冲突时先 Reverse Sync 再改代码，不扩成新的 propose / apply。

## Step 7：验证与归档（Verify / Archive）

```text
/helm:verify <change-id>
/helm:archive <change-id>
```

## Step 8：查看状态

```text
/helm:status
```

## Step 9（可选）：代码理解与影响分析

这一组没有 slash 入口：在会话里直接提问，`helm-workflow-router` 按意图加载对应的 `gitnexus-*` skill，详见 §5。

---

# 3. 可配置开关

HELM 多数纪律是**硬规则**（禁止自动 `push`、禁止自动 `stash`、`main` 上 Branch Confirm、文档与代码冲突先 Reverse Sync）。下面只列**用户可通过配置文件改行为**的开关。

生效路径：

| 文件 | 作用域 |
| --- | --- |
| `<AGENT_DIR>/helm-workflow.local.yaml` | 本机宿主目录；首次 install 从 example 拷贝，再 install 不覆盖 |
| `helm-profile.yaml` 或 local.yaml 的 `profile` 段 | 项目画像（构建、测试、符号定位、审查维度） |
| `.openspec/changes/<name>/.helm-state.yaml` | 单个 change 的闸门字段 |

改配置后一般**下一次**进入对应阶段即生效，不必重装。

## 3.1 `<AGENT_DIR>/helm-workflow.local.yaml`

| 开关 | 默认 | 行为说明 | 对话一句话 demo |
| --- | --- | --- | --- |
| `auto_commit` | `false` | `true`：每个 task 审查通过且构建 `exit 0` 后由工作流 `git commit`；`false`：完全不碰 git index | `把 auto_commit 打开，逐 task 自动提交` |
| `commit_message_guidance` | `""` | 仅在 `auto_commit: true` 时生效；填写后原文作为 message 约束传给 implementer | `commit message 按 Conventional Commits 来` |
| `feature_date_granularity` | `"YYYY"` | feature 目录日期前缀：`YYYY` / `YYYYMM` / `none` | `把 feature_date_granularity 改成 YYYYMM` |
| `codegraph_init` | `true` | `init` 是否对工作台内每个项目跑 CodeGraph 索引 | `关闭 CodeGraph：把 codegraph_init 设成 false` |
| `clone_max_concurrency` | `2` | `init` 时 `git clone` 的最大并发 | `把 clone_max_concurrency 调到 4` |
| `clone_depth` | `1` | `git clone --depth` 的浅克隆深度 | `把 clone_depth 改成 50` |
| `explore_max_concurrency` | `5` | 探索阶段子任务最大并发 | `把 explore_max_concurrency 改成 3` |
| `codegraph_max_concurrency` | `2` | `codegraph init` 最大并发 | `把 codegraph_max_concurrency 改成 1` |

任一取值下都**禁止自动 `push`**。键缺失或取值非法时按默认值降级，并在 `log.md` 记一行 `<key> = <default> (default applied)`，不静默失效。每个键的消费位置写在 `helm-workflow.local.example.yaml` 的 `# 消费位置：` 注释里。

## 3.2 项目画像 `profile`

画像回答「这个项目怎么构建、怎么测、符号怎么写」，让流程不预设语言。

| 段 | 键 | 缺失时默认 |
| --- | --- | --- |
| 命令 | `build_command`、`test_command`、`lint_command`、`artifact_command` | `null`，对应证据跳过（`lint` 不扣分） |
| 定位 | `source_roots`、`test_roots`、`symbol_locator`、`symbol_pattern` | 按 `project.language` 推导；`unknown` 取 `["."]` |
| 范围 | `repo_mode`、`target_repos`、`state_dir`、`change_root` | `auto`；单仓取 `[self]`；`.state`；`.openspec/changes` |
| 审查 | `review_dimensions`、`min_scenarios`、`require_tests_per_task` | `[spec, quality]`；按 `project.kind` 推导 |

加载顺序是「内置默认 → `helm-profile.yaml` → local.yaml 画像段 → `profile_override`」，逐键合并、不整体替换。完整 23 键与逐键默认值见 `helm-workflow.local.example.yaml`；`profile_override` 只用于本机临时覆盖，不入库。画像是给阶段 skill 读的约定，CLI 本身不解析它。

## 3.3 单 change：`.helm-state.yaml`

这些不是日常「体验开关」，但允许按 change 显式改写：

| 字段 | 取值 | 说明 |
| --- | --- | --- |
| `apply_mode` | `turbo` / `strict` | 执行策略真源。propose 写入后，apply、fix、verify 只读本字段 |
| `complexity_mode` | `lightweight` / `standard` | 复杂度档，决定是否需要 design review 与全量 artifacts |
| `target_repos` | 仓名列表 | 涉及仓；工作台模式下为空会硬停 |
| `design_review_status` | `pending` / `passed` / `skipped-by-turbo` | 设计审查状态 |
| `user_confirm_apply` | `true` / `false` | 人工确认闸门 |

`apply_mode` 派生出的五个旗标（`effectiveAutoCommit`、`autoCommitForcedOff`、`compileDeferred`、`utDeferred`、`unifiedVerifyRequired`）由 apply 写入后只读，任何阶段都不得自行推断。`branch_name`、`last_verified_task`、`reverse_sync_required` 属于流程状态机字段，**不要**当开关乱改。

---

# 4. 工作流命令详解

13 个阶段与横切 skill 的对应关系以 `skills/helm-workflow-router/SKILL.md` 为唯一权威，下面逐条列入口与产物。

## 4.1 `/helm:init`

**目标**：初始化或刷新多仓工作台。

```text
/helm:init
```

先判 Bootstrap（建台）还是 Bind（已就绪，只绑本机）。产物是 `.workbench.yaml`、`repos.manifest.yaml`、`.state/repos.links.yaml`、`<productline>.code-workspace` 与骨架目录；二次运行幂等。存在 manifest 但校验失败时硬停，不落盘、不假装成功。

## 4.2 `/helm:new`

**目标**：把需求接入 feature 容器。

```text
/helm:new <需求单号 / 文档链接 / 一句话描述>
```

确认前不建 `features/`、不下载文档。确认后建标准目录、写 `00-feature.md` 与 `10-requirements/prd/`，给出 `branch_name`（单仓默认 `feature/<change-name>`）。

## 4.3 `/helm:explore`

**目标**：探索问题空间，收集事实，产出 handoff。

```text
/helm:explore add-user-permission-check
```

执行重点是读仓库与相关代码、把决策逐条摊开，必要时生成 `exploration-handoff.md`。这一阶段不写代码。

## 4.4 `/helm:propose`

**目标**：把已澄清的需求固化成 OpenSpec artifacts。

```text
/helm:propose add-user-permission-check
```

前置是明确需求或 explore handoff。产物为 `proposal.md`、`specs/`、`design.md`、`tasks.md`、`log.md` 与 `.helm-state.yaml`；结束时有一道 HARD-GATE 等你确认后才算完成。

## 4.5 `/helm:apply`

**目标**：按 `tasks.md` 串行实现，保持 TDD、审查与 Reverse Sync 闭环。

```text
/helm:apply add-user-permission-check
```

前置：artifacts 齐全（standard 还需 design review 通过）、不在 `main` / `master`、`target_repos` 非空。

## 4.6 `/helm:apply-sprint`

**目标**：可恢复的长流程实现，断点写 `sprint-state.json`。

```text
/helm:apply-sprint add-user-permission-check
```

适用 task 数量多、单轮上下文放不下的 change；恢复时从 `sprint-state.json` 的断点继续，不重跑已完成的 task。

## 4.7 `/helm:fix`

**目标**：承接 review 或 verify 的定向修复。

```text
/helm:fix fix-order-status-sync
```

先 Reverse Sync 再改代码；只修列出来的问题，不扩成新的 propose / apply。

## 4.8 `/helm:verify`

**目标**：核对实现与规格一致（artifacts 完整性、TDD 证据、Reverse Sync 记录、log 与 state 一致性）。

```text
/helm:verify add-user-permission-check
```

## 4.9 `/helm:code-review`

**目标**：对改动做静态代码审查，产出 Markdown 报告。不改代码、不联网。

```text
/helm:code-review
```

有活动 change 时报告落在 `.openspec/changes/<name>/code-review-<YYYY-MM-DD>.md`，否则落在项目根的 `reviews/`；工作台模式下放 workspace 根的 `reviews/`。

## 4.10 `/helm:commit-impact`

**目标**：按 commit / diff 识别影响面，输出可执行测试清单。

```text
/helm:commit-impact
```

报告路径规则与 code-review 相同，文件名换成 `commit-impact-<YYYY-MM-DD>.md`。产出包含影响入口（同步与异步）、数据与环境准备、编号步骤与断言。

## 4.11 `/helm:archive`

**目标**：归档 change，并给出分支收尾建议。

```text
/helm:archive add-user-permission-check
```

归档前要求 `verify_complete: true`；收尾按 git 纪律给出「合并 / 保留 / 删除」三选一，不自动 push。

## 4.12 `/helm:status`

**目标**：查看活动 change、当前阶段、task 进度、阻塞原因与下一步建议。

```text
/helm:status
```

## 4.13 `/helm:auto`

**目标**：带人工闸门的自动编排，按 apply 的门禁规则串行推阶段，每一步停下等你确认。

```text
/helm:auto
```

它不重复定义 Build Gate，门禁实现以 `helm-workflow-apply` 为准，`auto` 只负责串联与提问。

---

# 5. 代码理解与影响分析（GitNexus）

这是一组**旁路能力**，不占 13 个阶段。它填的是「有流程门禁，但缺代码理解与影响分析」这块空白。前置是目标工程已建 GitNexus 索引。

> **许可提示**：本节这六个 skill 的文档派生自 [GitNexus](https://github.com/abhigyanpatwari/GitNexus)，而 GitNexus 采用 **PolyForm Noncommercial 1.0.0**，仅允许非商业使用。商业环境请先删除 `skills/gitnexus-*` 六个目录，或自行取得上游商业许可。详见 [`THIRD-PARTY-NOTICES.md`](./THIRD-PARTY-NOTICES.md)。

## 5.1 六个 skill

| skill | 什么时候加载 | 主要手段 |
| --- | --- | --- |
| `gitnexus-exploring` | 问「这段代码怎么工作」「整体架构是什么」「谁调用它」「主流程在哪」 | `gitnexus_query`、`gitnexus_context`，必要时 `gitnexus_cypher` |
| `gitnexus-impact-analysis` | 问「改这里会影响什么」「哪些地方会坏」「这个改动安全吗」 | `gitnexus_impact`，按 d=1 / d=2 / d=3 与置信度分级给风险 |
| `gitnexus-debugging` | 报错了要定位根因、追一个错误的来源 | 按错误关键词追调用链、`gitnexus_detect_changes` 对照改动 |
| `gitnexus-setup` | MCP 配不上、`gitnexus_query` 工具不存在、工具调不出来 | 检查 npm 可达性、索引状态与编辑器配置 |
| `gitnexus-guide` | 查有哪些工具、有哪些资源 URI、图结构怎么查 | `gitnexus://repo/{name}/schema` 等资源速查 |
| `gitnexus-cli` | 建索引、查索引新旧、清索引、生成 wiki、列出已索引仓库 | `npx gitnexus analyze` / `status` / `clean` / `wiki` / `list` |

## 5.2 索引与 MCP

```bash
npx gitnexus analyze --index-only   # 只建索引，写 .gitnexus/
npx gitnexus status                 # 看索引新鲜度
npx gitnexus setup                  # 装 MCP 配置（stdio）
```

`analyze` 不带 `--index-only` 时会额外写仓库集成文件（`AGENTS.md`、`CLAUDE.md`、agent skills、编辑器 hooks），这些文件由 HELM 托管，**统一加 `--index-only`**，不要让它覆盖。

MCP 不可用时这组 skill 会自行降级为 Grep 与 Read 读源码，不阻断流程：先读 `.gitnexus/AGENTS.md` 拿到模块索引，再按项目语言选扩展名（`.java`、`.ts`、`.py` 等）grep。GitNexus 从公开 npm 安装，需要能访问公网 npm 或配置镜像。

## 5.3 与 `systematic-debugging` 的分工

`gitnexus-debugging` 负责**代码级证据**：哪一行、哪个调用链、哪次改动引入。`systematic-debugging`（`skills/systematic-debugging/`）负责**流程化验证**：root-cause-tracing、defense-in-depth、condition-based-waiting 三份参考文档定义四阶段根因流程与回归用例写法。两者分工，不互相替代：先定位位置，再按流程验证根因。

后者的四个文件派生自 [obra/superpowers](https://github.com/obra/superpowers)（MIT，Copyright © 2025 Jesse Vincent），保留原版权声明，逐文件清单见 [`THIRD-PARTY-NOTICES.md`](./THIRD-PARTY-NOTICES.md)。

---

# 6. 目录结构

两套目录不要混用：**本仓**是流程开发与发布源；**业务项目**是 install 落盘目标。

## 6.1 本仓（`helm-workflow` 源仓）

维护者在这里改流程、发版；业务项目**不会**也**不应**复制整棵源仓树。

```text
helm-workflow/                   # 本 Git 仓库
├── skills/                      # L1 真源（helm-workflow-*、gitnexus-*、systematic-debugging）
├── agents/                      # persona 真源（README.md 仅导航，不分发）
├── commands/helm/               # nested 宿主薄壳（/helm:apply）
├── .claude/ .agents/            # nested 风格（Claude Code / ZCode）
├── .cursor/ .opencode/          # flat 风格（/helm-apply）
├── .codex/                      # workflow 风格（自然语言）
├── .github/                     # prompts + instructions（Copilot）
├── templates/                   # change 制品模板
├── references/                  # 加载契约、表达宪法、工作台解析、编排范式、安装说明
├── scripts/                     # CLI、安装器、校验器、宿主矩阵、单元测试
├── install.sh / install.ps1     # 一键安装
├── helm-workflow.local.example.yaml
└── CHANGELOG.md / INSTALLATION.md / AGENTS.md
```

## 6.2 业务项目（install 后）

install 把 payload **真源**物化到 `~/.helm`（可用 `--home` 指定），再把托管项**链接**到本次选定的宿主目录（链接失败则直拷）。

```text
~/.helm/                         # 共享真源
├── payload/                     # shared/ hosts/ runtime/ + payload.json
├── staging/                     # 升级暂存（成功后 commit，失败 rollback）
└── installations.json           # 安装账本

your-project/                    # 业务 Git 仓库
├── <AGENT_DIR>/                 # 如 .claude、.agents、.cursor、.opencode、.codex、.github
│   ├── commands/ 或 workflow/   # 宿主入口（链接或直拷的表面）
│   ├── skills/
│   ├── agents/
│   ├── templates/
│   ├── .helm-version            # 清单：卸载、升级、孤儿清理以它为准
│   └── helm-workflow.local.yaml # 用户配置，upgrade 不覆盖
└── .openspec/
    └── changes/<name>/          # 变更事实源（proposal/specs/design/tasks/log/.helm-state.yaml）
```

## 6.3 两种 layout

| layout | 何时产生 | 真源位置 | 表面形态 |
| --- | --- | --- | --- |
| `helm-home-v2` | 默认（使用 `~/.helm`） | `~/.helm/payload` | 逐项 link，失败回退 copy |
| `helm-copy-v1` | `--no-home` 或纯 copy 模式 | 宿主目录自身（`source_dir` 即真源） | 全部 copy，不依赖 `~/.helm` |

`--no-link` 与 `--no-home` 的区别：前者只是把链接换成拷贝，仍然共享 `~/.helm/payload`；后者完全不使用共享真源，升级互不影响，代价是每个宿主目录各存一份。

---

# 7. 统一开发流程

```text
需求
  -> /helm:init / /helm:new        （可选：工作台 + 需求接入）
  -> /helm:explore
  -> /helm:propose
  -> 人工确认
  -> /helm:apply / /helm:apply-sprint
  -> /helm:fix                     （按需）
  -> /helm:verify
  -> /helm:archive

旁路：/helm:code-review / /helm:commit-impact / /helm:status
代码理解：gitnexus-exploring / gitnexus-impact-analysis / gitnexus-debugging
```

核心原则：

- `No Spec, No Code`
- `Spec is Truth`
- `Reverse Sync`
- `Evidence Before Completion`
- 复杂度分 `lightweight` 与 `standard` 两档；standard 在实现前完成设计审查
- TDD、过程日志、状态文件与 git 纪律贯穿全流程

## 7.1 复杂度分档

| 档 | 标记 | 要求 |
| --- | --- | --- |
| 轻量 | 🟢 | proposal + specs + tasks；design 用一句占位；1–3 个原子 task；跳过 design review |
| 标准 | 🟡 / 🔴 | 全量 artifacts；必须 design review；每个 task 的 RED / GREEN / ASSERT / DoD 穷举到可执行 |

防偷懒：超过 5 个 task 仍全 🟢 要复查；新建核心服务或数据访问层最低 🟡；跨模块或跨仓直接 🔴。

## 7.2 三条铁律

1. `requires_skills` 是声明，不是加载。声明了就必须真加载，并留下 `### Skills Loaded:` 证据（契约见 `references/skill-loading-contract.md`）。
2. 主会话不能自己当 reviewer。每个 task 派独立子代理做 spec 与代码质量审查。
3. 文档与代码冲突，先 Reverse Sync，再写代码。

## 7.3 输出表达

面向用户的中文说明遵守「中文对话表达宪法」：真源是 `references/chat-style-constitution.md`，执行门禁是 `skills/helm-workflow-chat-style/SKILL.md`。规则要点是用完整句叙述、先给结论再展开、术语第一次出现解释含义，禁止箭头因果链与无主语片段。代码块、commit message、PR body 与逐字匹配的证据表头不在此限。

---

# 8. CLI 参考

```bash
helm-workflow <command> [选项]    # 别名：helm-wf
```

| 命令 | 作用 |
| --- | --- |
| `install` | 安装 / 纳管宿主（stage payload + 生成表面 + 写清单） |
| `uninstall` | 按清单卸载，先摘 hooks 条目再删表面 |
| `upgrade` | 刷新表面；带 `--source-dir` 时提升 payload（含降级拦截与 `.helm-version.bak` 备份） |
| `check` | 校验安装完整性（`checks` 逐条 PASS / WARN / FAIL） |
| `installations` | 列出账本 `~/.helm/installations.json`，`--prune` 清理失效行 |
| `list` | 打印宿主矩阵，`--ready-only` 只看可装项 |
| `doctor` | 环境自检（Node、home 可写、link 能力、配置、payload、账本、旧式安装） |
| `version` / `help` | 版本 / 帮助 |

通用选项：

| 选项 | 说明 |
| --- | --- |
| `-t, --target <spec>` | 宿主名、逗号列表、`auto` 或 `all`（默认 `auto`） |
| `--location <loc>` | `local`（默认）或 `global` |
| `--agent-dir <dir>` | 显式目标目录，优先级最高 |
| `--source-dir <dir>` / `--home <dir>` | 源仓目录 / 共享真源根（默认 `~/.helm`） |
| `--no-link` / `--no-home` | 一律 copy / 不使用共享真源 |
| `--force` | 覆盖冲突或连带升级 |
| `--dry-run` | 零副作用 |
| `--all` / `--json` / `-y, --yes` | 作用于全部安装 / 机读输出 / 跳过确认 |

退出码契约（全仓唯一来源 `scripts/lib/runtime-filenames.mjs`）：

```text
0 OK   1 CHECK_FAILED   2 ARG   3 SOURCE_INCOMPLETE   4 CONFLICT
5 IO_ERROR   6 NETWORK   7 PARTIAL   8 BUSY
```

---

# 9. 依赖

HELM 自身只依赖 Node.js 标准库，其余依赖按使用场景划分。

- **Node.js ≥ 20.19**：跑 CLI、安装器与校验器
- **Git**：克隆源仓；流程内的分支、diff、commit 审计
- **Agent 宿主**：Claude Code、ZCode、Cursor、OpenCode、Codex、Copilot 之一
- **外部 skill 集**：`brainstorming`、`test-driven-development`、`subagent-driven-development`、`verification-before-completion` 等由宿主环境提供，不随 HELM 分发
- **GitNexus（可选）**：`npx gitnexus`，从公开 npm 安装；只在用 §5 的代码理解能力时需要
- **一键脚本额外依赖**：Linux 与 macOS 需要 `curl` 与 `unzip`，Windows 用 PowerShell 自带的 `Invoke-WebRequest` 与 `Expand-Archive`

OpenSpec artifacts 是纯 Markdown 目录，HELM 自身不依赖 `openspec` CLI；只有你想额外跑 `openspec validate` 时才需要单独安装它。

---

# 10. 开发与校验

```bash
npm test            # node --test scripts/test/*.test.mjs
npm run verify      # 结构、证据、链路一致性校验（200+ 项，含 frontmatter 与模板覆盖）
npm run pack:check  # npm pack --dry-run，确认 payload 清单
```

源仓提交前建议启用结构护栏 hook：

```bash
git config core.hooksPath .githooks
```

协作法则见 [`AGENTS.md`](./AGENTS.md)：文档语言、提交信息格式、目录职责与禁止事项都在那里。行为以对应版本的 `SKILL.md` 为唯一权威；跨语言使用时流程不预设构建工具，构建与测试命令由各仓通过 `profile` 提供。

---

# 11. 许可证

本仓以 **MIT** 许可发布，完整文本见 [`LICENSE`](./LICENSE)。

有两点需要单独说明，它们的效力高于上面这句话。

**第一，第三方内容不随本仓的 MIT 走。** `skills/systematic-debugging/**` 来自 `obra/superpowers`（MIT，Copyright © 2025 Jesse Vincent），`skills/gitnexus-*/**` 的文档来自 `abhigyanpatwari/GitNexus`（PolyForm Noncommercial 1.0.0，Required Notice: Copyright Abhigyan Patwari）。逐文件的来源、修改说明与完整许可证文本都在 [`THIRD-PARTY-NOTICES.md`](./THIRD-PARTY-NOTICES.md)。

**第二，GitNexus 相关文件只能用于非商业目的。** PolyForm Noncommercial 明确禁止商业使用。如果你要在商业环境里使用 HELM，请先删除 `skills/gitnexus-*` 六个目录，或自行向上游作者取得商业许可。删除后流程主体不受影响，只是失去代码理解与影响分析那一路能力。

# 12. 来源与致谢

**流程骨架建立在规格驱动交付（spec-driven delivery）这一业界通行实践之上。** HELM 的阶段划分（explore → propose → apply → verify → archive）、`HARD-GATE` 闸门语义、`Reverse Sync` 冲突处理、`.openspec/changes/<name>/` 的产物布局、以及 `L0/L1/L2/L3` 的分层方式，都是这类工作流的常见构成。HELM 在其之上做的是三件事：把命名与目录改成宿主中立的通用形态、补上安装器与结构校验、把「什么时候必须停」写成可机检的契约。

**工具与技能生态来自公开项目。** 规格管理复用 [OpenSpec](https://github.com/Fission-AI/OpenSpec) 的结构关键字；实现阶段的 TDD、brainstorming、subagent 协作依赖 [Superpowers](https://github.com/obra/superpowers) 提供的 skill 集；代码理解与影响分析依赖 [GitNexus](https://github.com/abhigyanpatwari/GitNexus)。这三者都通过宿主环境或 `npx` 获取，不随本仓分发。
