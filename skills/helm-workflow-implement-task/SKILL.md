---
name: helm-workflow-implement-task
description: Implements one HELM task with mandatory TDD and project code style. Use when apply dispatches implementer for a single unchecked task.
requires_skills:
  - superpowers:test-driven-development
  - helm-workflow-reverse-sync
---

# HELM Implement Task

## Overview

单 task 实现。TDD 不可豁免。冲突时返回 `REVERSE_SYNC_REQUIRED`。

## Context placeholders

主会话填充：`{task}`, `{acceptance_criteria}`, `{specs}`, `{design}`, `{code_style}`, `{debugging_guide}`, `{db_convention}`, `{api_convention}`（见 `templates/implementer.context.md`）。

**占位符替换硬约束（MUST）**：dispatch 前主会话**禁止**保留任何 `{xxx}` 形式的未替换占位符；若某值不可得，须以 `""` 或 `null` 显式标注。Commit message 不在 implementer 职责内（由主会话在 commit gate 自行生成）。

## 工程规范（HARD-GATE）

数据库与接口契约的规范正文不在本文件里重写，只看两个真源。主会话在 apply S1.4 判定命中后会把条款编号传给 `{db_convention}` / `{api_convention}`；本 task 命中而占位符为 `null` 时，implementer MUST 自己读规范全文，并返回 `REVERSE_SYNC_REQUIRED`（原因写 `规范未注入`），不得凭记忆实现。

| 命中条件 | 必读真源 | 本 task 的硬约束 |
| --- | --- | --- |
| 建表、加列、改列、索引、迁移脚本、DO / BO / Mapper / Repo | `references/db-design-convention.md` | 先落 `docs/db/<领域>/<业务>.md`，再据文档写 DDL，再搭实体骨架；通用字段不进文档但进 DDL；不建外键；表级 `utf8mb4`；表与每列都有 `COMMENT` |
| Controller、接口路径、method、DTO / VO、request / response、错误码、鉴权 | `references/api-contract-convention.md` | 走完 7 步流程；`create` / `update` 前必须 `cli-schema get` + `validate`；写后必须回读；破坏性变更先要授权；被权限阻塞要报告而不是跳过 |

**建表任务的最小交付面（MUST，缺一即返回 BLOCKED）**：

1. 设计文档（七列固定表 + 索引小节 + 变更记录）。
2. flyway 迁移脚本（命名 `V<yyyyMMddHHmm>__<snake_case>.sql`，含通用字段与 `COMMENT`）。
3. `BaseModel`（工程已有则复用，不得重复造）。
4. `XxxDO` / `XxxBO` / 枚举类。
5. `XxxMapper` / `XxxRepo`(+Impl) / `XxxService` / `XxxApplication` 骨架，覆盖基础 CRUD。

**不允许的省事做法**：只写 DO 与 Mapper 就收口；把文档推迟到"下次补"；用 `sql` 里的 `COMMENT` 代替设计文档；在 Controller 里直接返回 DO。

## 执行体矩阵

| 模式 | 🟢 | 🟡 | 🔴 |
| --- | --- | --- | --- |
| `strict` | 派 `implementer` 子代理 | 派 `implementer` | 派 `implementer` |
| `turbo` | 主会话直改 | 主会话直改 | 派 `implementer` |

规则：

- `require_tests_per_task` **由画像决定**（`service`/`library`/`web`/`mobile`/`multi` 默认 `true`；`data`/`infra`/`docs` 默认 `false`）。缺失时按 `project.kind` 推导并 log 记 `require_tests_per_task: <v> (default applied)`。
- `require_tests_per_task: true` → 每个 `code`/`refactor` task MUST 写测试；`test_command: null` → **停止**，要求先补画像（不得"写了但不跑"地糊过去）。
- `require_tests_per_task: false` → MUST 写该 task `type` 对应的最小可判定验证资产（见 S3.5 表），MUST NOT 强制写测试文件。
- `utDeferred: true` 时：写验证资产但**不运行**，checkpoint 标注 `Verification 证据：待统一验证` 与 `UT 证据：待统一验证`。
- `autoCommitForcedOff: true` 时：**禁止**任何 per-task commit（覆盖 `effectiveAutoCommit`）。
- 必须在本次实现结束时写入 `### Skills Loaded` 证据段（见 `references/skill-loading-contract.md`）。


## Process

> **前置加载（HARD-GATE）**：MUST 用 Skill 工具实际加载 frontmatter `requires_skills` 的全部项（声明 ≠ 加载）；
> MUST 在本阶段日志写入 `### Skills Loaded` 证据段，声明了但未列出的依赖判为未加载；
> 任一项加载失败 → 立即停止，不得降级继续。
> 路径基准：仓库根相对路径（见 `references/skill-loading-contract.md` 第 0 节）。
> 完整规则见 `references/skill-loading-contract.md`。
   RED → GREEN → REFACTOR 节奏与 Reverse Sync 触发条件以已加载的对应 skill 为唯一权威。

2. 加载完成后严格按 `superpowers:test-driven-development` 执行 RED → GREEN → REFACTOR
3. 实现范围仅限当前 task；遵循项目 code style（由 `{code_style}` 提供）
4. 遇 artifact/代码冲突 → `helm-workflow-reverse-sync`，停止实现
5. 无 RED 证据 → 报告 BLOCKED
6. 自检：编译、测试、spec 覆盖

## Output

成功时：

- 修改的文件列表
- 实现说明
- 自检 checklist
- TDD 证据（RED/GREEN/REFACTOR）
- 规范证据（命中时）：DB 写设计文档路径 + 迁移脚本路径 + 实体骨架清单；API 写 `### Apifox Sync` 六行（见规范第 6 节）

失败时：

```text
### REVERSE_SYNC_REQUIRED
- 冲突点：
- 受影响 artifact：
- 需要补充的事实：
```

## Verification

- [ ] 有失败测试证据后才写实现
- [ ] 测试通过且未超出 task 范围
- [ ] 命中数据库规范时：设计文档先生成，DDL 与文档一致，通用字段在 DDL 中齐全
- [ ] 命中接口契约规范时：`### Apifox Sync` 六行齐全且已回读

## Red flags

- task 标注「无需测试」仍跳过 TDD
- 先写实现后补测试
- 先写 `CREATE TABLE` 再补设计文档，或用「文档下次补」推迟
- 设计文档里列了 `created_at` / `deleted` 这类通用字段
- 建表语句漏 `COMMENT`、带外键、或没写 `utf8mb4`
- 改了 Controller 直接收口，既不同步 Apifox 也不报告阻塞
