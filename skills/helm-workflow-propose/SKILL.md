---
name: helm-workflow-propose
description: Propose phase for HELM — complexity tiering, OpenSpec artifacts, design review, HARD-GATE user confirm. Use when starting or continuing a change proposal.
requires_skills:
  - helm-workflow-router
  - helm-workflow-reverse-sync
  - helm-workflow-design-review
  - openspec-propose
  - superpowers:writing-plans
---

# HELM Propose

## Overview

生成 `proposal` → `specs` → `design`（按需）→ `tasks`，初始化 `log.md` 与 `.helm-state.yaml`。行为以本 skill 的步骤与门禁为准。

## When to Use

- 新 change 或补齐 propose 阶段 artifacts
- explore 结束后升格为正式合同

## When NOT to Use

- 用户未确认即进入 apply（见 S6 的 HARD-GATE）
- 用 code-reviewer 替代 design-reviewer（见 S5）

## Process

### S0 — 双模根解析（HARD-GATE，workbench 模式专属）

1. 调用 `resolveRoot()` 获取 `{ root, mode }`
   - 解析契约见 `references/workbench-resolution.md`；**MUST NOT** 自行假设返回值或在失败时回退到当前目录。
2. `mode=workbench`：
   - 输入主参为 `change-id` 或 handoff 路径
   - 消费 `20-design/handoffs/<change-id>.md`（不再脑暴，brainstorm 仅 explore）
   - 校验 handoff 已写满（stub → 硬停，提示回 explore 续写）
   - 校验 `depends_on` 已满足（未满足 → 硬停）
   - artifacts 根 = `<root>/.openspec/changes/<name>/`
3. `mode=single-repo`（单库）：保持今日行为（S1 及后续步骤不变）

### S1 — 加载编排与 OpenSpec

> **前置加载（HARD-GATE）**：MUST 用 Skill 工具实际加载 frontmatter `requires_skills` 的全部项（声明 ≠ 加载）；
> MUST 在本阶段日志写入 `### Skills Loaded` 证据段，声明了但未列出的依赖判为未加载；
> 任一项加载失败 → 立即停止，不得降级继续。
> 路径基准：仓库根相对路径（见 `references/skill-loading-contract.md` 第 0 节）。
> 完整规则见 `references/skill-loading-contract.md`。
   tasks/RED 拆解 / design review 流程 / OpenSpec artifacts schema 以已加载的对应 skill 为唯一权威，本 SKILL 不重写其规则。
2. 读取宿主 `<AGENT_DIR>/templates/`：`spec.md`, `tasks.md`, `log.md`, `helm-state.example.yaml`, `exploration-handoff.md`；**任一缺失则停止**，提示对当前 `AGENT_DIR` 重跑 install

### S2 — Handoff 承接

1. 若来自 explore：必读 `.openspec/changes/<name>/exploration-handoff.md` 或 runtime `last-exploration-handoff.md`
2. 无 handoff 但用户声称来自 explore → **停止**，提示先 explore
3. handoff 仅作过渡输入；正式约束须写入 proposal/specs/tasks；冲突以 artifacts 为准并记 log

### S3 — 复杂度判定

1. 结合需求、Research、brief 判定：🟢 lightweight / 🟡🔴 standard
2. 本轮默认固定；仅 Research 冲突时升级并记录原因
3. 写入 `.helm-state.yaml`：`complexity_mode`
4. **外部验收声明（MUST）**：`.helm-state.yaml` 的 `external_verification` 固定写 `none`；项目需要接入外部验收时改为 `required`，并在 `design.md` 写清验收清单与执行方式。`none` 时不得创建任何验收合同文件。

### S3.5 执行模式确认（HARD-GATE）

**判断**：读取 `.helm-state.yaml` 的 `apply_mode`。

- 已存在且为 `turbo` / `strict` → 跳过询问，直接进入下一步，并在 log 记录 `apply_mode: <值>（已配置，跳过询问）`。
- 不存在 → 必须询问，**使用固定模板，不得改写选项语义**：

```text
请选择本次 change 的执行模式：

1. turbo  — 少往返：逐 task 只实现不编译不单独审查，最后一次性编译 + 集中审查 + 全量 UT；不产生 per-task commit。
2. strict — 强隔离：每个 task 各自编译 + 单独审查 + 单独 commit（commit 由 `apply` S1.3 派生的 `effectiveAutoCommit` 决定）。

推荐：task 数 ≥ 8 且风险分散 → turbo；涉及核心链路或多人协作 → strict。

回复 1 或 2。
```

**落盘（双写）**：

1. 写入 `.helm-state.yaml` 的 `apply_mode`（**权威**）。
2. 在 `tasks.md` 顶部写入 `apply_mode: <值>`（**校验镜像**）。

**一致性**：两处不一致时，以 `.helm-state.yaml` 为准，并触发 `helm-workflow-reverse-sync`。


### S4 — Reverse Sync 与 Artifacts

1. **初始化 change 目录（MUST）**：生成其他 artifacts 之前，先执行 `openspec new change "<name>"` 创建 `.openspec.yaml`。若 `openspec new change` 不可用（网络/npx 失败），则手写 `.openspec.yaml`（含 `schema: spec-driven` + `created: <当前日期>`）
2. Research 冲突：先记代码出处，写入 proposal/specs 待澄清，不得猜测
3. **🟢 lightweight**：proposal + specs + tasks；design 一句或 schema 占位；1–3 原子 task；每 task 含验收、最小验证、DoD
4. **🟡/🔴 standard**：全量 artifacts；原子动词+对象；高熵 `Implement/Handle/Process` 自动改写并记 log；≤3 层、5–9 子任务、独立验证、atomic commit。
   每个 🟡/🔴 task 的 **RED / GREEN / ASSERT / DoD 必须穷举到可执行级别**（不是抽象描述）：
   - **RED 清单**：每条形如「<可定位锚点>（<输入/前置条件> → 断言 <期望行为>）」，锚点形态由画像 `symbol_locator` 决定（见 S4.5 G3），不得写死某一种语言的方法名形态
     场景覆盖为 **code 类参考清单**（非 code 类按 `type` 的证据锚点词表 G5 取等价项）；条数下限见 S4.5 G4 的 `min_scenarios[type]`：
       1. Happy path（核心业务流）
       2. 终止 / 短路条件（hasNext=false、empty、null 入参）
       3. 错误 / 异常路径（依赖抛异常、配置缺失、上游失败）
       4. 边界（partial result、fewer-than-expected、配置 fallback）
       5. 调用次数 / 顺序（断言调用次数 N 次 / 0 次，框架由技术栈决定）
   - **GREEN**：具体命令（如 `<test_cmd> <TestClassName>`（按仓内配置））+ 期望"全部转绿"
   - **ASSERT**：对哪些依赖 verify 调用次数与精确入参；短路路径下哪些方法 0 次调用；边界值精确断言（不补 null、不静默吞错）
   - **DoD**：可执行的完成定义（如"<TestClassName> 全部转绿 + `<build_cmd>` exit 0 + 关键路径覆盖率不低于 X%"），禁止"功能可用"等抽象表述
5. **任务依赖关系（MUST）**：`tasks.md` 须含「任务依赖关系」小节——ASCII 树或依赖矩阵、可并行 vs 串行 task、Git Worktree 分组建议、汇合点与阻塞点；共享核心文件/接口/状态流/测试夹具的 task 不得标为可并行，须说明串行原因；`log.md` 记录依赖图与并行分组判断
6. **`tasks.md` 格式（MUST）**：严格遵循 `templates/tasks.md`；每个 task **必须**为行首 `- [ ] Task N: <动词> <对象>`（与 OpenSpec `openspec-apply-change` 一致）；**禁止**仅用 `### Task` 或行内 ``完成状态：`[ ]` `` 表示进度
7. **生成后自检（MUST，机械扫描）**：写入 change `tasks.md` 后逐条校验：
   - 至少一行匹配 `^- \[ \] Task`
   - standard 下每个 task 子项含 RED、GREEN、ASSERT、DoD
   - 每条 RED **必须含可定位锚点**（形态由画像 `symbol_locator` 决定，见 S4.5 G3）；缺锚点的 RED 视为空话 → 停止
   - 每个 🟡/🔴 task 的 RED/验证 条目数 ≥ 画像 `min_scenarios[type]`（缺省值见 S4.5 G4）；不足 → 停止
   - 每条 RED 必须含该 `type` 对应的证据锚点词（见 S4.5 G5）；缺 → 停止
   - ASSERT 段不得为空，且不得仅写"全部转绿"
   - 任一校验失败 → **停止**，不得标 `propose_artifacts_complete`，回到 task 重新拆解
8. 初始化/更新 `log.md`、`.helm-state.yaml`（`current_phase: propose`）
9. 复杂度防偷懒校验（见 `helm-workflow-router`）

### S4.5 tasks 可执行性闸门（MUST）

在标记 `propose_artifacts_complete: true` 之前，必须逐项检查 `tasks.md`。任一项不通过 → **停止**，不得标记完成，不得进入 apply。

**先读画像**：`project.kind` / `project.language` / `symbol_locator` / `symbol_pattern` / `min_scenarios` / `require_tests_per_task` / `test_command` / `change_root` / `spec_source`。
画像缺失时按默认表执行，并在 log 记 `profile: missing (defaults applied)`。

| # | 检查项 | 判定方式（按 task 的 `type` 分档） |
| --- | --- | --- |
| G1 | 每个 task 有 `files:` 且非空 | `^\s*-\s*files:` 数量 = task 数量 |
| G2 | 每个 task 有色标 | 块内命中 `🟢\|🟡\|🔴` ≥ 1 |
| G2b | 每个 task 有 `type:` | 块内命中 `^\s*-\s*type:`；缺失按 `project.kind` 推导并 log 记 `type: <v> (default applied)` |
| G3 | 可定位锚点 | 用画像的 `symbol_locator` / `symbol_pattern` 匹配：`jvm` 匹配「类型 + `#` + 方法」形态；`dotted` 匹配 `模块.函数`；`path` 匹配相对路径；`heading` 匹配标题/`§`；`none` 见 G3' |
| G3' | `locator: none` 时的替代 | 必须命中四类之一：具体文件路径 / 具体命令+预期输出片段 / 配置键名（`a.b.c`）/ 错误码或状态码或日志字面量 |
| G4 | 场景数 ≥ `min_scenarios[type]` | 见本节末尾"计数口径 G4" |
| G5 | 每条场景有证据锚点 | 命中该 `type` 的证据锚点词表（见下） |
| G6 | 每条场景有具体期望 | 命中 `期望\|assert\|断言\|应为\|返回\|等于\|exit code\|输出\|errors?\s*[:=]`；且不含 `验证正确\|确保正常\|逻辑正确\|功能正常\|应该没问题` |
| G7 | 顶部 `apply_mode:` 与 state 一致 | 字符串比对 |
| G8 | 无抽象动词 | 禁止把 `优化一下\|完善\|处理相关逻辑\|支持一下` 作为唯一描述 |
| G9 | 测试可用性 | 若 `require_tests_per_task: true`：该 task MUST 声明至少一条 `unit/integration/e2e/contract/snapshot` 类验证意图，**且** 画像 `test_command` MUST 非 `null`。任一不满足 → 不通过，提示"先补画像 `test_command` 或把该 task 的 `type` 改为非 code 类" |

**G5 证据锚点词表（按 type）**：

| type | 词表（命中任一即可） |
| --- | --- |
| `code` | `mock\|桩\|fake\|stub\|spy\|返回\|抛\|throw\|raises?\|returns?\|\bexpect\b\|断言\|assert\|快照\|snapshot` |
| `config` | `默认值\|default\|缺失\|缺省\|非法\|invalid\|回退\|fallback\|生效\|override\|覆盖` |
| `docs` | `命令\|command\|截图\|screenshot\|链接\|link\|可复现\|reproduce\|按步骤\|checklist` |
| `data` | `行数\|row count\|口径\|grain\|主键\|primary key\|重复\|duplicate\|空值\|null\|分布\|distribution\|对账\|reconcile` |
| `infra` | `plan\|diff\|漂移\|drift\|destroy\|替换\|replace\|资源名\|resource\|副本\|replica` |
| `refactor` | `行为不变\|no behavior change\|旧路径\|old path\|已删除\|removed\|调用点\|call site\|基准\|baseline` |

**G4 的兜底粗筛正则**（仅当 tasks.md 缺少 `RED:` / `验证:` 小节时使用，不与上条口径并用）：

```regex
^\s*-\s+(?!files:|type:|色标|DoD|RED:|验证)
```

**计数口径（唯一，覆盖上表 G1 / G4 / G8；与上表冲突时以本段为准）**：

- **G1**：task 计数正则 `^\s*-\s*\[[ x]\]\s*Task\s+\d+`；命中数 MUST 等于 `^\s*-\s*files:` 命中数。
- **G4**：场景数下限读画像 `min_scenarios[type]`（`code` 5 / `config` 2 / `docs` 1 / `data` 2 / `infra` 2 / `refactor` 3）；只数 `RED:` / `验证:` 小节下以 `-` 开头的条目，**不去重**。上表旁列的 `regex` 块只是"结构损坏时的兜底粗筛"，不得与本节口径并用。
- **G8**：黑名单正则 `优化一下\|完善一下\|完善\|处理相关逻辑\|增强稳定性\|支持相关\|相关逻辑处理`；在 task **标题**与 **DoD** 中命中即 FAIL（作为唯一描述时；同行另有具体动作记 WARN）。

**不通过时的输出格式**（必须逐条列出，不许只说"不通过"）：

```markdown
### tasks 闸门未通过

| 检查项 | 位置 | 问题 | 修改建议 |
| --- | --- | --- | --- |
| G3 | Task 2 RED | 未见可定位锚点（locator=path） | 改为「修改 `<source_roots>/orders/submit` 的提交入口」 |
| G4 | Task 4 验证 | 场景 1 条，`min_scenarios.config` = 2 | 补一条"键缺失时回退默认值"的验证 |
| G9 | Task 6 | `require_tests_per_task: true` 但画像 `test_command` 为 null | 补 `test_command`，或把该 task 的 `type` 改为 `docs` |
```

修正后必须重新跑闸门，直到全部通过。

修正后 MUST 重跑闸门，直到全部通过；**禁止**只输出"不通过"或不带定位的结论。


### S5 — 设计审查

1. **lightweight（全 🟢）**：跳过 design-reviewer
2. **standard**：加载 `design-reviewer` persona + `helm-workflow-design-review`；传入 artifacts；**最多 2 轮**
3. 禁止 `code-reviewer` 路由；无效路由须重跑
4. 通过后：`design_review_passed: true`，`design_review_agent: design-reviewer`，log 记录轮次

### S6 — HARD-GATE

1. 输出复杂度、模式、artifacts 清单、待澄清项
2. **用户显式确认前禁止 apply**；确认后设置 `user_confirm_apply: true`（或等价 state 字段）
3. 可选 learnings → `learnings.md` + log

## Verification

- [ ] S2–S6 均在 Process 有对应步骤（宿主 shell 不重复定义）
- [ ] `complexity_mode` 与 task 标记一致
- [ ] `external_verification` 已写入 yaml；`none` 时无验收合同文件
- [ ] standard：`design_review_passed: true` 后才可确认 apply
- [ ] handoff 已升格或记录在 log
- [ ] `apply_mode` 已写入 `.helm-state.yaml` 与 `tasks.md` 顶部，且两处一致

## Red flags

- 未确认即进入 apply
- 用 code-reviewer 做 design review
- handoff 替代正式 proposal/specs/tasks
- 跳过 Research 冲突澄清
- change `tasks.md` 无行首 `- [ ] Task` 仍进入 design review 或 HARD-GATE
- 🟡/🔴 task 的 RED 没有具体测试方法名（implementer 拿到没法对照写 UT）
- 🟡/🔴 task 的 RED 不含 mock 输入与期望（implementer 又得做一次设计判断）
- 🟡/🔴 task 的 RED 条目数 < 5（5 类场景未穷举）
- ASSERT 段空或仅写"全部转绿"
