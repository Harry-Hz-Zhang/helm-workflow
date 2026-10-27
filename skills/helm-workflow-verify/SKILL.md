---
name: helm-workflow-verify
description: Post-apply verification — spec coverage, correctness, design consistency, process integrity (TDD, review, Reverse Sync, commits). Use when all tasks are marked complete.
requires_skills:
  - helm-workflow-router
  - superpowers:verification-before-completion
---

# HELM Verify

## Overview

验证实现与 OpenSpec artifacts 一致，并拦截未 Reverse Sync 的偏差、缺失 TDD 证据或流程违规。

## When to Use

- `tasks.md` 全部 `[x]` 后、archive 前
- 用户要求完整性/正确性审计

## When NOT to Use

- 仍有未完成 task — 用 `helm-workflow-apply`
- 已知 Critical 且未 fix — 先 `helm-workflow-fix`

## Process

### S0 — 双模根解析（HARD-GATE，workbench 模式专属）

1. 调用 `resolveRoot()` 获取 `{ root, mode }`
   - 解析契约见 `references/workbench-resolution.md`；**MUST NOT** 自行假设返回值或在失败时回退到当前目录。
2. `mode=workbench`：
   - 记录每个业务仓 / 模拟服务仓的 `base_commit`（多仓 base_commit，用于 diff 验证）
   - 仓本机路径经 `resolve(name)` 解析（权威来自 `.state/repos.links.yaml`，**MUST NOT** 从入库 manifest 读 `repo_path`）
   - `resolve(name)` 的路径权威是本机 `.state/repos.links.yaml`；**MUST NOT** 从入库 `repos.manifest.yaml` 的 `repo_path` 读取。
   - `git -C <resolve(name)> diff <base_commit>..HEAD` 逐仓验证
   - `resolve(name)` 的路径权威是本机 `.state/repos.links.yaml`；**MUST NOT** 从入库 `repos.manifest.yaml` 的 `repo_path` 读取。
3. `mode=single-repo`（单库）：保持今日行为（记录单仓 base_commit）

### S1 — 强制加载前置 skill

> **前置加载（HARD-GATE）**：MUST 用 Skill 工具实际加载 frontmatter `requires_skills` 的全部项（声明 ≠ 加载）；
> MUST 在本阶段日志写入 `### Skills Loaded` 证据段，声明了但未列出的依赖判为未加载；
> 任一项加载失败 → 立即停止，不得降级继续。
> 路径基准：仓库根相对路径（见 `references/skill-loading-contract.md` 第 0 节）。
> 完整规则见 `references/skill-loading-contract.md`。
   验证范围 / 准入门槛 / 报告格式以已加载的 `superpowers:verification-before-completion` 为唯一权威，本 SKILL 不重写其规则。

### S2 — 确定 change 与 diff

1. 确定 change；读取 `.helm-state.yaml`、proposal、specs、design、tasks、log
2. `git diff <base_commit>..HEAD`（stat + 全文）
3. **外部验收（MUST）**：读取 `.helm-state.yaml` 的 `external_verification`。`none` → 跳过；`required` → 检查 design 中的验收清单与执行记录，缺证据记 **Warning**，不单独判 Critical。

### S3 — 完整性验证

1. **完整性**：tasks 全完成；逐条 spec ✅/❌

### S4 — 正确性验证

1. **正确性**：意图匹配、边界、错误处理；🟡/🔴 有测试变更与最小闭环；DoD 与验证命令一致

### S5 — 一致性验证

1. **一致性**：与 design 对齐；偏离须有理由

### S6 — 流程完整性检查

1. **流程完整性**：串行 apply；双 review；无只改生产代码的 completed task；🟡/🔴 有 RED/GREEN/ASSERT；Reverse Sync 无遗漏；log 有 task 记录；design review 用 design-reviewer；main/master 有实现 → Critical；跳过 TDD 说法 → Critical
   - **tasks 格式**：全部 task 须为行首 `- [x]`；若仍存在 `^- \[ \]` → Critical（未完成）
   - **checkbox 协议**：若仅用 `### Task` / 行内 ``完成状态：`[ ]` `` 而无行首 checkbox → Critical（与 OpenSpec/HELM apply 不兼容）
   - **commit 粒度**（standard）：`base_commit..HEAD` commit 数与 `- [x]` task 数严重不符（如 9 个 task 仅 1 个实现 commit）→ **Warning**（流程债务）；log 无 per-task TDD 段 → Critical（🟡/🔴）
   - sprint：`sprint-state.json` checkpoints 数应与 completed task 一致（偏差 → Warning）

### 证据归一化（MUST，先于一切判定）

先读取 `.helm-state.yaml` 的 `apply_mode` 与五个派生旗标（本文件只消费，不推导）。

读取 `log.md`，先把旧字面量归一化为结构块：

| 旧字面量 | 归一化为 |
| --- | --- |
| `### Build Evidence Task N` | `type: build`、`style: per-task`、`result` 由 `exit code` 推断 |
| `### 统一验证` | `type: unit`、`style: unified`、`scope: all` |
| `- 统一验证 UT: <cmd>` | `command: <cmd>` |
| `- 用例数: <n> passed, <m> failed` | `summary: Tests: <n> passed, <m> failed` |
| `- exit code: 0` | `result: pass`（非 0 → `fail`） |
| 代码块内 `$ <cmd>` | `command: <cmd>` |
| `Stage: code-quality` | 维度 `quality` |

归一化后，同一 task 同时存在新旧块 → 以新块为准（log 记 `evidence: legacy block superseded`）。

### 验证证据校验（MUST）

读取画像（`build_command` / `test_command` / `verification_types` / `require_tests_per_task`）与 state（`unifiedVerifyRequired` / `evidence_style` / `utDeferred`）：

| 条件 | 要求 |
| --- | --- |
| `evidence_style: per-task` | 逐 task 检查 `### Verification Evidence Task N`（或归一化后的旧块）；缺失 → Critical |
| `evidence_style: unified` | 必须存在 `### Verification Evidence Unified`（或 `### 统一验证`），且其 `type` MUST 属于 `verification_types` ∪ `{build}` |
| `build_command: null` | MUST NOT 因缺 `type: build` 判失败 |
| `require_tests_per_task: true` | 每个 `code`/`refactor` task MUST 有 `unit`/`integration`/`e2e`/`contract`/`snapshot` 之一 |

**判定规则**：

| # | 情形 | 结论 |
| --- | --- | --- |
| V1 | 有 `type: build` 的 `pass`，但无任何测试类证据，且 `require_tests_per_task: true` | **Critical**：编译通过不能替代测试 |
| V1b | `build_command: null` 且无 build 证据 | **NOT a finding**（不得报） |
| V2 | `result: pass` 但 `command` 为空或 `summary` 为空 | **Critical**：无命令/无摘要 |
| V3 | 测试类证据的用例数为 0（`0 passed` / `Tests: 0` / `no tests found`） | **Critical**：空跑 |
| V3b | 测试类证据 `summary` 不含任何数字 | **Critical**：无法判定 |
| V4 | 块标题被改写（`### 验证证据` / `## Verification Evidence` 等） | **Warning** → 视为缺失，按 V1 处理 |
| V5 | `utDeferred: true` 但某 task 声称已跑测试 | Warning：延迟模式下不应有 per-task 测试证据 |
| V6 | `result: skip` 但 `summary` 未写原因 | **Critical**：跳过得说明 |
| V7 | `type` 不在 `verification_types ∪ {build}` | Warning：视为缺失该类证据 |
| V8 | `artifacts` 指向的文件不存在 | Warning |
| V9 | `### Verification Evidence Unified` 缺 `- scope:` | Warning：无法判断该块覆盖哪些 task |
| V10 | `result: partial` 但 `summary` 未写"跳过项 + 原因" | **Critical**：partial 必须可解释 |

**`result: partial` 的判定**：视为**通过**，但 `summary` MUST 同时含跳过项与原因；缺任一 → 按 V10 判 Critical。

**v2 形态补充（MUST）**：`### Verification Evidence Task N` 存在但块内无任何测试类 `type`（只有 `build`）→ 按 **V1** 判 Critical（这是 V1 的 v2 形态，不得因为"有证据块"就放过）。

**commit 粒度判定修正**：当 `unifiedVerifyRequired: true` 时，`commit_hash` 为空**不是** Warning（turbo 本就零 commit）。

### 文本证据扫描（WARN 门禁）

对 `log.md` 执行字面量扫描，缺失项以 Warning 输出（不阻断，但必须列出）：

- `### Skills Loaded`
- 以 `### Review Evidence` 开头的段（前缀匹配：`### Review Evidence` / `### Review Evidence Task N` / `### Review Evidence Batch` 任一即可）
- `### Verification Evidence` 或 `### Build Evidence Task` 或 `### 统一验证`
- `### Resolution`

`- exit code: 0` MUST NOT 单独作为"验证已执行"的证据（旧格式下它只是结果行之一，需与命令行配对）。


### S7 — 编译/测试

1. **编译/测试**：执行项目最小验证（命令来自仓内配置，如 `<build_cmd>` / `<test_cmd>`）

### S8 — 输出验证报告

1. 输出验证报告：完整性/正确性/一致性/流程/Critical/Warning/Suggestion/结论
2. 有 Critical → 用户选择 fix / apply / archive（不推荐）；无 Critical → 提示 archive

## 外部验收（可选）

`.helm-state.yaml` 的 `external_verification` 决定是否接入外部验收流程：

| 值 | 行为 |
| --- | --- |
| `none`（默认） | 只用仓内测试与人工审查，不调用任何外部平台 |
| `required` | 按项目自建的外部验收清单执行，结论并入验证报告；缺证据记 Warning |

外部验收的失败不得直接判 Critical，除非 spec 明确写入。

## Verification

- [ ] 报告含 Critical 分级与结论
- [ ] base_commit 来自 state 或已说明
- [ ] 未在无证据时宣称可 archive
- [ ] `external_verification: none` 时报告不含外部验收小节

## Red flags

- 跳过流程完整性检查
- 有 Critical 仍建议直接 archive
- 未读 diff 即标 PASS
- `external_verification: none` 时仍调用外部验收平台
