---
name: helm-workflow-apply
description: Apply phase — serial per-task implementer and reviewers, TDD evidence, Reverse Sync, per-task commit. Use after propose user confirmation.
requires_skills:
  - helm-workflow-router
  - helm-workflow-reverse-sync
  - helm-workflow-git-discipline
  - helm-workflow-implement-task
  - helm-workflow-review-implementation
  - superpowers:test-driven-development
  - superpowers:subagent-driven-development
---

# HELM Apply

## Overview

逐 task **串行**：implementer → 双 review → 回写 tasks/log/state → 最小验证 → commit。门禁与证据要求见本 skill 各步骤。

## When to Use

- propose HARD-GATE 已确认(A2)
- 功能分支上执行(A1)

## When NOT to Use

- `reverse_sync_required: true` 且 artifacts 未更新
- 并行 dispatch 多个 implementer(A3)

## Preconditions

- 分支门控：通过 `helm-workflow-git-discipline` 的 Branch Confirm 子流程（master/main 入口必须由用户确认创建/选择功能分支或取消，禁止静默硬停）
- `user_confirm_apply` 或 propose 已完成且用户已确认(A2)
- 读取 change：proposal、specs、design、tasks、log、`.helm-state.yaml`、handoff（若 `exploration_handoff_path` 存在则必读）
- standard：`design_review_passed: true`

## Process

### S0 — 双模根解析（HARD-GATE，workbench 模式专属）

1. 调用 `resolveRoot()` 获取 `{ root, mode }`
   - 解析契约见 `references/workbench-resolution.md`；**MUST NOT** 自行假设返回值或在失败时回退到当前目录。
2. `mode=workbench`：
   - `branch_name` 从 `00-feature.md` 读取
   - 仓本机路径经 `resolve(name)` 解析（权威来自 `.state/repos.links.yaml`，**MUST NOT** 从入库 `repos.manifest.yaml` 读 `repo_path`）
   - `resolve(name)` 的路径权威是本机 `.state/repos.links.yaml`；**MUST NOT** 从入库 `repos.manifest.yaml` 的 `repo_path` 读取。
   - 对每个业务仓 / 模拟服务仓用 `git -C <resolve(name)> checkout -b <branch_name>`
   - `resolve(name)` 的路径权威是本机 `.state/repos.links.yaml`；**MUST NOT** 从入库 `repos.manifest.yaml` 的 `repo_path` 读取。
   - 提交域隔离：workbench 仓仅提交治理资产；业务仓 / 模拟服务仓用 `git -C <resolve(name)>` 提交代码
   - `resolve(name)` 的路径权威是本机 `.state/repos.links.yaml`；**MUST NOT** 从入库 `repos.manifest.yaml` 的 `repo_path` 读取。
   - 禁止混仓 commit
3. `mode=single-repo`（单库）：保持今日行为（在当前仓 checkout 分支，无 `git -C`）

### S1 — 前置(A1, A2, A1b）

> **前置加载（HARD-GATE）**：MUST 用 Skill 工具实际加载 frontmatter `requires_skills` 的全部项（声明 ≠ 加载）；
> MUST 在本阶段日志写入 `### Skills Loaded` 证据段，声明了但未列出的依赖判为未加载；
> 任一项加载失败 → 立即停止，不得降级继续。
> 路径基准：仓库根相对路径（见 `references/skill-loading-contract.md` 第 0 节）。
> 完整规则见 `references/skill-loading-contract.md`。
   TDD / subagent 编排 / git 纪律 / reverse-sync 触发条件以已加载的对应 skill 为唯一权威，本 SKILL 不重写其规则。
   **加载完成前禁止**：读取 change artifacts、执行 `git branch --show-current`、进入 task 循环
2. `git branch --show-current`：
   - 若为 main/master → **进入 Branch Confirm 子流程**（见 `helm-workflow-git-discipline`）：
     - 主会话通过用户确认机制展示默认分支名 `feature/<change-name>` + 三选项（接受默认 / 自定义 / 取消）
     - 用户取消 → 停止 apply
     - 用户接受/自定义 → 创建并切换功能分支；`base_commit = git rev-parse HEAD` 写入 state
   - 非 main/master → 直接放行
3. **Commit 策略加载（MUST，显式两值）**：单次读取 `<AGENT_DIR>/helm-workflow.local.yaml`，把以下两值**同时**写入 `.helm-state.yaml.runtime`（session 内备查；不是 propose 持久化字段；用于 S6 commit gate 强制 re-load）：
   - `auto_commit`（缺省 `false`）→ `.helm-state.yaml.runtime.auto_commit`
   - `commit_message_guidance`（缺省 `""`）→ `.helm-state.yaml.runtime.commit_message_guidance`
   缺任一值的 runtime 块都视为加载失败 → **停止** apply，要求重新进入
4. **`tasks.md` 格式（MUST）**：至少一行 `^- \[ \]` 或 `^- \[x\]` 匹配 `Task`；否则 **停止**（提示回 propose / Reverse Sync 改 tasks）
5. **工作区校验（仅 `effectiveAutoCommit: true` 时 MUST）**：`git diff --stat` 须干净（无未提交改动）；否则 **停止**（先完成上一 task commit 或 revert）。`autoCommitForcedOff: true` 或 `effectiveAutoCommit: false` 时**跳过**此校验，允许工作区有未提交改动
6. `git rev-parse HEAD` → `base_commit`（若空）；更新 state：`current_phase: apply`, `execution_mode: serial`（sprint 时为 `sprint`）

### S1.3 读取执行模式并派生旗标（MUST）

1. 读 `.helm-state.yaml` 的 `apply_mode`。缺失 → 按 `strict` 处理并记录 `apply_mode: strict（默认）`。
2. 按派生表写入五个旗标：
   - `strict` → `effectiveAutoCommit` = `helm-workflow.local.yaml` 的 `auto_commit`（默认 false）；其余四个为 `false`
   - `turbo`  → `effectiveAutoCommit: false`、`autoCommitForcedOff: true`、`compileDeferred: true`、`utDeferred: true`、`unifiedVerifyRequired: true`
3. 写入 `.helm-state.yaml`。`unifiedVerifyRequired: true` 时同时写 `evidence_style: unified`，否则写 `per-task`。
4. 记录 `base_commit`（`git rev-parse HEAD`）。
5. 校验 `target_repos` 非空：`repo_mode: workbench` 且为空 → 停止，要求先在 propose 补声明；`repo_mode: single`（或判定为 single）→ MUST 解析为 `[self]`，**不得**因未显式声明而停止（见 `references/workbench-resolution.md` 第 6 节）。
6. 校验 `tasks.md` 顶部 `apply_mode` 与第 1 步一致；不一致 → 触发 `helm-workflow-reverse-sync` 并停止。

**读取纪律**：以下四个时点必须**重新读取** `.helm-state.yaml`，不得使用会话早期缓存：
- 每次准备 git commit 前
- 每次准备写 `### Verification Evidence Task N` 前
- 进入集中审查前
- 进入统一验证前


### S2 — 串行 task 循环(A3)

对每个 `- [ ]` task，**不得**并行多个 implementer。

### S2.5 预检与接续（MUST）

#### 2.5.1 残留预检

开始实现前，必须检查：

| # | 检查 | 失败处置 |
| --- | --- | --- |
| P1 | task 声明的 `files` 是否已存在残留改动（`git status --porcelain <files>`） | 有残留 → 判定为"上次中断"，进入 2.5.2 |
| P2 | 待新增的类/方法是否已存在（按画像 `symbol_locator` 的形态检索符号名） | 已存在 → 判定为"上次已完成一部分"，进入 2.5.2 |
| P3 | `tasks.md` 勾选状态与 `log.md` 证据是否一致 | 不一致 → 以 log 证据为准，修正勾选 |

#### 2.5.2 自动修复（≤ 2 轮）

发现残留 → 最多执行 2 轮修复：

1. 第 1 轮：按残留内容补齐缺失部分（不改已正确的部分）。
2. 第 2 轮：若仍不一致 → 记录冲突明细。

2 轮后仍不一致 → **停止**，输出：

```markdown
### 预检未通过

- task: <编号>
- 残留项: <文件 / 符号>
- 冲突原因: <为什么无法自动接续>
- 建议: <回滚该文件 / 人工确认 / 拆分 task>
```

#### 2.5.3 abort 接续

若上一轮 apply 被中断（abort）：

- **MUST** 接续现态：从"最后一个有完整证据的 task"之后继续。
- **MUST NOT** 整 task 重派（会把已完成的改动再做一遍，产生冲突与 token 浪费）。
- 必须在 log 写一条：`abort 接续：从 Task <n> 继续，已保留 <文件清单>`。


### S3 — 实现(A4)

1. 派发 **implementer** persona + `helm-workflow-implement-task`（填充 `templates/implementer.context.md`）
2. 子代理内强制执行 TDD：**RED**（失败测试+命令）→ **GREEN**（通过）→ **REFACTOR**（或「无」）
3. 无 RED/GREEN 证据 → 不得进入 review

#### S3.5 延迟策略（`compileDeferred` / `utDeferred`）

当 `compileDeferred: true` 或 `utDeferred: true` 时：

| 动作 | 🟢 / 🟡 / 🔴 | 说明 |
| --- | --- | --- |
| 写验证资产（测试文件 / 校验脚本 / plan 检查清单 / 链接基线） | 允许且当 `require_tests_per_task: true` 时 **MUST** | 不得以"稍后补"为由跳过 |
| 写实现代码 / 配置 / 文档 | 允许 | 同 strict |
| 运行 `test_command` / 各 `verification_types` 命令 | 禁止 | 留给统一验证 |
| 运行 `build_command` | 禁止 | 留给统一验证 |
| 勾选 `[x]` | 禁止 | 留给集中审查 + 统一验证之后 |
| 写 `### Verification Evidence Task N` | 禁止 | 改为在事件表标注 `Verification 证据：待统一验证` |
| 写 `### Review Evidence` | 禁止 | 改为在事件表标注 `Review 证据：待集中审查` |

**当 `require_tests_per_task: false` 时**：上表第一行的"验证资产"MUST 改为该 task `type` 对应的最小可判定动作（`config` → 校验脚本或 `plan`；`docs` → 链接基线；`infra` → `plan` 输出快照；`data` → 对账查询）。MUST NOT 强制写测试文件。

**当 `build_command: null` 时**：`compileDeferred` 无实际意义，MUST 在 log 记 `compileDeferred: true (no build_command, no-op)`，不算违规。

**checkpoint 要求**：即使延迟，每完成一个 task 仍必须写一条 checkpoint（改动文件清单 + 预期行为），供中断后接续。

**恢复执行**：若从 turbo 中途切到 strict（改 `apply_mode`）→ 必须触发 Reverse Sync，且已完成但未验证的 task 要补 `build_command` 与 `test_command`（各自非 `null` 时）的证据。

**与 S6.5 构建硬门的关系（MUST）**：

| 情形 | S6.5 构建硬门 | 说明 |
| --- | --- | --- |
| `compileDeferred: false` | MUST 执行，`exit code: 0` 才可勾选 | 与今日行为一致 |
| `compileDeferred: true` | **跳过 S6.5**，改由 S6.8 统一验证承担编译 | 跳过不是"放宽"，是把编译集中到统一验证 |

`compileDeferred: true` 时，log 的事件表 MUST 写 `Build 证据：待统一验证`，且 MUST NOT 写 `### Verification Evidence Task N` 的 `type: build` 块。


### S4 — 审查(A5)

#### S4.0 审查强度与维度（色标矩阵）

按 task 色标决定**审查强度**，按画像 `review_dimensions` 决定**审查维度**。

**读取维度集**：`review_dimensions` 缺失 → 按 `project.kind` 默认（service/library → `[spec, quality, security]`；web/mobile → `[spec, quality, a11y]`；data → `[spec, quality, data]`；infra → `[spec, quality, security, cost]`；docs → `[spec, docs]`；multi → `[spec, quality]`）。

| 色标 | strict 模式 | turbo 模式 |
| --- | --- | --- |
| 🟢 低 | 可跳过。跳过时必须在 log 写 `skipped-lightweight-task: Task <n> — <理由>`；但若 `review_dimensions` 含 `security` 或 `data` 或 `a11y`，MUST 至少审该维度一次 | 不单独审，并入 S4.5 集中审查 |
| 🟡 中 | 1 次独立审查，覆盖 `review_dimensions` 全部维度 | 不单独审，并入 S4.5 |
| 🔴 高 | 2 次：第一次覆盖 `spec`，第二次覆盖其余全部维度；两次 MUST 由**不同**子代理执行 | 不单独审，并入 S4.5；但集中审查时该 task 的 🔴 项必须单独列出结论，且覆盖 `review_dimensions` 全部维度 |

**维度别名**：旧文档中的 `code-quality` MUST 归一化为 `quality`（解析时统一，写入时可写任一）。

**禁止**：

- MUST NOT 因"改动很小"把 🔴 下调为 🟡。
- MUST NOT 由主会话自己充当审查者（见 S4.2 证据闸门）。
- MUST NOT 用同一个子代理连续做第一次与第二次审查（必须两个独立 ID）。
- MUST NOT 漏审 `review_dimensions` 中的任一维度（漏 = 该维度判"未执行"）。

#### S4.1 执行步骤

**强制子代理派发（MUST）**：每个 task 的 review **必须**通过 Agent / Task 工具派发独立子代理执行，**禁止**主会话自己"扮演 reviewer 角色"边读 diff 边自说自话。判定主会话偷懒的硬性证据：

- 主会话输出 review 结论但**没有**调用过 Agent / Task 工具
- review 结论紧接 implementer 输出之后无独立子代理 turn boundary
- review 文本里直接复述 implementer 的自检 checklist

任一证据成立 → 视为 review **未执行**，S6 收口闸门拒绝勾选与 commit。

1. **第一次审查（🔴 固定 `spec`；🟡 为全维度）**：派发 `implementation-reviewer` 子代理
   - 工具：`Agent` / `Task`（视宿主可用工具）
   - subagent_type：`implementation-reviewer`（或宿主等价 reviewer persona）
   - 输入：`templates/reviewer.context.md` 填好的 `{git_diff}` / `{specs}` / `{design}` / `{code_style}` / `{complexity}`
   - 输出：子代理返回 `PASS` / `BLOCKED` + Critical / Important / DESIGN_ISSUE 列表
   - 主会话记录子代理 turn ID / 返回原文摘要到 `log.md`
2. **第二次审查（仅 🔴，覆盖除 `spec` 外的全部维度）**：MUST 派发**另一个**子代理实例
   - 输入：同上 + `code_style` 与 `complexity` 强调维度
   - 输出与记录同第 1 步
3. **🔴 task**：MUST 额外派发 `design-reviewer` 预审 artifacts；DESIGN_ISSUE → Reverse Sync
4. 所需维度的子代理均返回 `PASS` 后才可收口；任一返回 `BLOCKED` → 处理 BLOCKED 项再重派子代理（每阶段累计 ≤ 3 轮，超出走 S7）

**验证证据复用**：implementer 是编译/测试命令 owner；reviewer 默认复用 RED/GREEN/build 证据，不重复跑验证。仅当证据缺失、未覆盖验收范围、review 中代码变更、构建/夹具/wiring 变更，或高风险路径无法仅凭代码+证据判断时，才要求子代理重跑并说明最小命令范围。

**子代理审查证据落 `log.md`（MUST）**：每轮 review 后追加一段，段标题以 `### Review Evidence` 开头（逐字）：

```markdown
### Review Evidence

| Stage | Subagent ID | Verdict | 范围 |
| --- | --- | --- | --- |
| `spec` | `agent-7f3a2b` | `PASS` | Task 3 diff |
| `quality` | `agent-9c1d4e` | `PASS` | Task 3 diff |
```

段标题的允许后缀（三者都能被 S6 闸门以**前缀匹配**识别）：

| 场景 | 段标题写法 |
| --- | --- |
| strict 逐 task（推荐） | `### Review Evidence Task N` |
| strict 不区分 task | `### Review Evidence` |
| turbo 集中审查 | `### Review Evidence Batch` |

无该段证据 → S6 收口闸门拒绝勾选与 commit。


#### S4.2 审查证据闸门（MUST）

每次审查结束后，必须向 `log.md` 写入 `### Review Evidence` 段，格式固定：

```markdown
### Review Evidence

| Stage | Subagent ID | Verdict | 范围 |
| --- | --- | --- | --- |
| `spec` | `agent-7f3a2b` | `PASS` | Task 3 diff |
| `quality` | `agent-9c1d4e` | `PASS` | Task 3 diff |
| `security` | `agent-9c1d4e` | `FAIL → 已修` | Task 3 diff |
```

判定规则（逐条硬性）：

| # | 规则 | 违规判定 |
| --- | --- | --- |
| E1 | 必须有 `Stage` / `Subagent ID` / `Verdict` 三列 | 缺列 → 审查未执行 |
| E2 | `Subagent ID` 必须非空且不是 `main` / `self` / `主会话` | 主会话自演 → 审查未执行 |
| E3 | 🔴 的第一次（`spec`）与第二次（其余维度）的 `Subagent ID` 必须不同 | 相同 → 第二次审查未执行 |
| E4 | `Verdict` 必须是 `PASS` / `FAIL` / `FAIL → 已修` / `SKIP`（`SKIP` 仅允许 🟢 且必须同行写理由） | 其它文字 → 审查未执行 |
| E5 | `范围` 必须与模式一致（strict = 当前 task；turbo = 累计） | 超范围 → 证据无效 |
| E6 | 表中 MUST 覆盖 `review_dimensions` 的每一项（`code-quality` 归一化为 `quality` 后比对） | 缺维度 → 该维度审查未执行 |
| E7 | `Stage` 取值 MUST 属于 `review_dimensions`（归一化后） | 出现未知维度 → WARN，不计入覆盖 |

任一 task 的任一必需维度被判"未执行" → 该 task MUST NOT 勾选 `[x]`，且不得进入 commit。

**与 S6 的映射（MUST）**：S6 收口闸门以**前缀匹配**识别证据段——
`### Review Evidence`、`### Review Evidence Task N`、`### Review Evidence Batch` 三者等价成立。
因此 strict 模式推荐写 `### Review Evidence Task N`（便于逐 task 定位），turbo 集中审查写 `### Review Evidence Batch`。
**MUST NOT** 写 `## Review Evidence`（二级）或 `### 审查证据`（中文）——视为证据缺失。


#### S4.5 集中审查（Batch Review，仅 turbo）

**触发条件**：`apply_mode: turbo`（含 `compileDeferred: true` 的场景）。

**时机**：全部 task 的实现与 checkpoint 完成后，**全量编译之前**。

**范围**：`git diff <base_commit>..HEAD`（累计 diff），按 task 的 `files` 分组呈现。

**执行**：

1. 派 **1 次** `implementation-reviewer` 子代理，输入累计 diff + `tasks.md` + `specs/`。
2. 输出必须覆盖：规格符合性（逐 task）、代码质量（整体）、跨 task 一致性、`review_dimensions` 的**每一个维度**。
3. 🔴 task 必须在结论中单独列出（不得混在整体结论里）。

**证据格式**：

```markdown
### Review Evidence Batch

| 维度 | Subagent ID | Verdict | 覆盖 |
| --- | --- | --- | --- |
| spec | `agent-4a1b` | `PASS` | Task 1–8 |
| quality | `agent-4a1b` | `PASS` | Task 1–8 |
| 🔴 专项 | `agent-4a1b` | `PASS` | Task 3、Task 7 |
```

**E3 的适用范围（重要，消除自相矛盾）**：

| 规则 | 适用范围 | 说明 |
| --- | --- | --- |
| E3（两次审查 ID 必须不同） | **仅 strict 逐 task 的 🔴 双阶段** | turbo 不适用 |
| 批量审查的 ID | **允许三行同一 `Subagent ID`** | 因为是同一子代理一次产出；但**必须按维度分行给结论**，每行 `Verdict` 独立，不得用一行"整体 PASS"代替多维度 |

**禁止**：

- MUST NOT 因为某个 task 是 🔴 就把集中审查拆成逐 task 双阶段（那就退化成 strict 了）。
- MUST NOT 在集中审查前执行全量编译（审查对象是代码，不是编译产物）。
- MUST NOT 用单行"整体 PASS"代替按维度的分行结论。

集中审查 PASS 之后，才允许：①进入统一验证（S6.8）；②按 S6 的顺序批量勾选 task `[x]`。


### S5 — Reverse Sync(A6)

若 spec 缺项、文档与代码冲突、边界未清：

1. 停止当前 task；返回 `REVERSE_SYNC_REQUIRED`
2. 先更新 proposal/specs/tasks/design + `log.md`（`helm-workflow-reverse-sync`）
3. `reverse_sync_required: false` 后才继续实现

### S6 — 收口(A7, A7b)

> **顺序固定为 0 → 1 → 2 → 3 → 4 → 5 → 6 → 7 → 8。不得重排、不得跳步。**

0. **证据闸门（MUST，最先校验）**
   - `log.md` 中本 task 必须存在以 `### Review Evidence` 开头的段（前缀匹配；`### Review Evidence Task N` 与 `### Review Evidence Batch` 都算）。
   - 每段必须含 `Stage` / `Subagent ID` / `Verdict` 三列，且覆盖 `review_dimensions`（旧名 `code-quality` 归一化为 `quality`）。
   - 🔴 task 在 strict 模式下，两次审查的 `Subagent ID` 必须不同。
   - 任一不满足 → **停止**，回 S4 / S4.5 派发子代理。**主会话自己"读完 diff 觉得没问题"不算 review。**

1. **范围（仅 `effectiveAutoCommit: true` 时 MUST）**
   - 将提交的 diff **仅**含当前 task 声明的 `files`；含其他未完成 `- [ ]` task 的文件 → **停止**（禁止 batch commit）。
   - `effectiveAutoCommit: false` 时**跳过**此校验。

2. **`tasks.md` 双层回写（MUST）**
   - 若同时有 `Task Checklist` 与 `### Task N` 细项，须在同一次编辑中同步顶层 checkbox 与细项 `完成状态` / 子 checkbox；仅改一层 → **停止**；回写后重读 `tasks.md` 确认一致。
   - **本步只做"格式回写"，不勾选 `[x]`**（勾选在第 5 步）。

3. **构建验证（S6.5）**
   - `compileDeferred: true` → **跳过本步**，在事件表写 `Build 证据：待统一验证`，进入第 4 步。
   - `compileDeferred: false` → 执行构建命令并验证 `exit code = 0`：
     - 构建命令按以下优先级探测：① 画像 `build_command`；② 宿主项目配置文件中的 `build_command` 声明；③ 项目根标准构建脚本；④ 项目特征文件推断。
     - `exit code ≠ 0` → **停止**，回到 fix 修复。**无论 `effectiveAutoCommit` 取值，都禁止勾选 `[x]`。**
     - CLI 环境不可用 → 要求人工提供构建工具输出证据（含成功标志 + `exit code 0` 最后 5–10 行），记录到 log。无有效证据 → **禁止收口**。
   - 证据写入（v2 正式格式）：
     ```markdown
     ### Verification Evidence Task N
     - command: `<完整命令>`
     - type: build
     - result: pass
     - summary: `<末尾 5–10 行中的关键行，含 exit code>`
     ```

4. **统一验证（S6.8，`unifiedVerifyRequired: true` 时 MUST）**
   - 顺序：先编译（若第 3 步未执行则在此执行），后测试。**不得并行，不得颠倒。**
   - 写 v2 块 `### Verification Evidence Unified`（含 `- scope:`），并**追加 v1 兼容三行**（`### 统一验证` / `- 统一验证 UT:` / `- exit code: 0`）。
   - `result: fail` 或 exit != 0 → **不得勾选任何 task**。
   - `unifiedVerifyRequired: false` → 跳过本步（证据已在第 3 步的 per-task 块里）。

5. **勾选 `[x]`（只能在第 3、4 步通过之后）**
   - strict：仅将**当前** task 行 `- [ ]` → `- [x]`（一次一个，不得批量）。
   - turbo：集中审查 PASS + 统一验证 `result: pass` 之后，**一次编辑**批量勾选本 sprint 内的 task；勾完重读 `tasks.md` 确认无遗漏。
   - 任一门禁未通过 → **本条不执行**，task 保持 `- [ ]`。

6. **`log.md` 回写**
   - 本 task 的 RED/GREEN 命令输出、reviewer 结论、决策、tasks 双层回写结果、`effectiveAutoCommit` 取值。

7. **`.helm-state.yaml` 回写**
   - `last_verified_task`、`active_review_stage: commit_gate`。

8. **Git 收口（commit gate，主会话执行）**
   - 8.0 **强制 re-load（MUST）**：commit 前**重新读取** `.helm-state.yaml` 的五个派生旗标与 `.helm-state.yaml.runtime`；不可读 → **停止**。
   - `autoCommitForcedOff: true` 或 `effectiveAutoCommit: false` → **不 commit**，只写一行日志。
   - `effectiveAutoCommit: true` → 按 `helm-workflow-git-discipline` 的提交策略执行（含 message 生成与 diff 范围校验）。
   - 任何模式下 **MUST NOT** `git push`。


#### S6.8 统一验证细则（第 4 步的展开，位置在 S6 末尾便于引用）

> 本小节是第 4 步的展开说明，不是新增步骤；执行顺序仍以 0 → 8 为准。


**顺序**：先 `build_command`（若非 `null`），后 `test_command`（若非 `null`）。不得并行，不得颠倒。

1. 若 `build_command` 为 `null` → 跳过第 2 步，写 `type: build` + `result: skip` + 原因。
2. 执行 `build_command`；`exit code != 0` → 写 `result: fail` 并停止，不得进入测试。
3. 若 `test_command` 为 `null` → 写 `type: unit` + `result: skip` + 原因，并检查 `require_tests_per_task`：
   - `true` → **停止**，要求先补画像 `test_command`（G9 会在 propose 阶段就拦住，此处的停止是最后一道防线）。
   - `false` → 允许继续。
4. 执行 `test_command`，写 `### Verification Evidence Unified` 块（字段见 `templates/log.md`）。
5. 若画像声明了 `verification_types` 中的 `integration` / `e2e` / `data-check` / `plan-diff` / `link-check` → 各产出一个块（可以是 `evidence_style: per-task` 下的独立块），**不得**只写 unit。

**硬性规则**：

| # | 规则 |
| --- | --- |
| U1 | 编译 `result: pass` **不能**替代测试证据；测试类证据必须实际存在 |
| U2 | `summary` 必须是**测试/校验命令**的输出摘要，不是编译的 |
| U3 | 块标题与字段名 MUST 逐字一致（`### Verification Evidence Unified` / `- scope:` / `- command:` / `- type:` / `- result:` / `- summary:`），否则 verify 读不到 |
| U4 | `result: fail` → 不得勾选任何 task，必须修复后重跑 |
| U5 | `build_command: null` 时 MUST NOT 因缺 build 证据判失败 |
| U6 | `result: skip` MUST 写原因，且不得用于"不想跑"的情形 |

**`evidence_style: per-task`**：本段不执行（每 task 已有自己的证据块）。

**v1 兼容尾部（MUST 原样写进 log）**：v2 块之后紧跟下列三行字面量，供 `verify` 与既有工具链读取：

```markdown
### 统一验证

- 统一验证 UT: `<测试命令>`
- 用例数: `<n> passed, <m> failed`
- exit code: 0
```

规则：

| # | 规则 |
| --- | --- |
| U1′ | 编译 `exit code: 0` **不能**替代测试证据；测试必须实际执行 |
| U2′ | `exit code` 必须是**测试命令**的退出码，不是编译的 |
| U3′ | `### 统一验证` / `- 统一验证 UT:` / `- exit code: 0` 三段字面量**不得改写** |
| U4′ | 测试失败（`result: fail` 或 exit != 0）→ 不得勾选任何 task，必须修复后重跑 |
| U5′ | 写证据前 MUST 重新读取 `.helm-state.yaml`（见 S1.3 读取纪律） |

**strict 模式**：本段不执行（每个 task 已完成编译与测试，证据在各 task 的 `### Verification Evidence Task N`）。

### S7 — 失败暂停(A8)

任一 review 阶段**累计 3 轮**未通过：

1. 暂停；输出审查摘要
2. 用户选择：`helm-workflow-fix` / 跳过 task / 终止 apply

### 完成

- 全部 task 完成后建议 `helm-workflow-verify` 或 `helm-workflow-fix`

## Complex task（standard）

顺序：**implementer checkpoint 完成** → **implementation-reviewer**（spec 然后 code quality）。复杂 task 可用双 Background Agent：实现 agent 产出 checkpoint 后，独立 review agent 复核（review 不得改生产代码）。

## Verification

- [ ] master/main 入口经过 Branch Confirm 子流程，未静默硬停
- [ ] 每完成 task 有 TDD 证据 + log + build exit code 0 证据
- [ ] 每完成 task 有以 `### Review Evidence` 开头的段，覆盖 `review_dimensions`，且 🔴 的两个子代理 ID 不同
- [ ] `effectiveAutoCommit: true` 时每 task 一个 commit；`autoCommitForcedOff: true` 或 `effectiveAutoCommit: false` 时未触发 git 操作且未打断用户
- [ ] A1–A8 流程已执行
- [ ] 无 reviewer 通过前 commit
- [ ] 无自动 push

## Red flags

- master/main 上静默硬停（应进入 Branch Confirm 子流程）
- 未经用户确认自动切分支
- 并行 dispatch 多个 implementer
- 无 RED 即进入 review
- 先改代码再 Reverse Sync
- review agent 修改生产代码
- 单次 commit 覆盖多个仍为 `- [ ]` 的 task
- `tasks.md` 无行首 checkbox 仍继续实现
- `effectiveAutoCommit: true` 时工作区脏仍开始下一 task
- **主会话自己读 diff 出"已审查"结论**：没有 Agent / Task 子代理调用证据 → 视为未 review
- log.md 无 `### Review Evidence` 段就进入 S6
- 子代理 Verdict 是 BLOCKED 仍勾 task 或 commit
- 收口前缺少 build exit code 0 证据
- 构建阻断期间勾选 task `[x]`
- `autoCommitForcedOff: true` 或 `effectiveAutoCommit: false` 时仍触发 `git commit` 或提示用户 commit、校验工作区干净
