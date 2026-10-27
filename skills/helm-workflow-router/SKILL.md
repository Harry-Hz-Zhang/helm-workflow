---
name: helm-workflow-router
description: HELM meta skill — complexity tiers, artifact paths, 13-stage routing, and cross-cutting skill index. Load before other helm stage skills.
requires_skills:
  - helm-workflow-chat-style
---

# HELM Workflow

## Overview

Canonical 编排入口：OpenSpec artifacts 事实源、复杂度分层、init + 13 阶段 stage skill 路由与横切 skill 引用。编辑真源仅根目录 `skills/`、`agents/`、`templates/`。

## When to Use

- 进入任一 `helm-<stage>` 之前
- 需要确认 `complexity_mode`、change 路径或应加载的横切 skill

## When NOT to Use

- 用户已明确单一阶段且对应 stage skill 已完整加载

## Process

1. 定位 active change：`.openspec/changes/<name>/`（proposal、specs、design、tasks、log、`.helm-state.yaml`；apply-sprint 另有 `sprint-state.json`）
2. 读取 `complexity_mode`：🟢 lightweight / 🟡🔴 standard
3. **13 阶段 routing**（canonical skill 名 = 目录名）：

| 阶段 | Skill | 典型横切 |
| --- | --- | --- |
| init | `helm-workflow-init` | — |
| new | `helm-workflow-new` | —（feature 为兼容转发入口，不单独占阶段） |
| explore | `helm-workflow-explore` | brainstorming, openspec-explore |
| propose | `helm-workflow-propose` | `helm-workflow-design-review`, openspec-propose, writing-plans |
| apply | `helm-workflow-apply` | TDD, subagent-driven-development, `helm-workflow-implement-task`, `helm-workflow-review-implementation` |
| apply-sprint | `helm-workflow-apply-sprint` | 同上 + sprint state |
| fix | `helm-workflow-fix` | `helm-workflow-reverse-sync`, TDD |
| verify | `helm-workflow-verify` | verification-before-completion |
| code-review | `helm-workflow-code-review` | 独立报告生成：`code-review-<YYYY-MM-DD>.md`（落盘见其 S3.1） |
| commit-impact | `helm-workflow-commit-impact` | 影响面 + 测试清单：`commit-impact-<YYYY-MM-DD>.md`（落盘见其 S5.1） |
| archive | `helm-workflow-archive` | openspec-archive, finishing-a-development-branch |
| status | `helm-workflow-status` | — |
| auto | `helm-workflow-auto` | 按 apply 的门禁规则串行编排；不重复定义 Build Gate |

4. **横切**（两档）：
   - 常驻：`helm-workflow-chat-style`（任何面向用户的输出都受其约束，见「输出表达」）
   - 按需：`helm-workflow-reverse-sync`、`helm-workflow-git-discipline`
5. 复杂度防偷懒：>5 个 task 全 🟢 → 复查；新建 Mapper/Service → 最低 🟡；跨模块 → 🔴

## 代码理解与影响分析

这一组不是阶段 skill，不占用上表的 13 个阶段。用户在下面这些意图下提出请求时，按表加载对应 skill。这些 skill 需要目标工程已建立 GitNexus 索引；MCP 不可用时它们会自行降级为 Grep 与 Read 读源码，不阻断流程。

| 用户怎么说 | 加载哪个 skill | 说明 |
| --- | --- | --- |
| 这段代码怎么工作 / 整体架构是什么 / 谁调用它 / 主流程在哪 | `gitnexus-exploring` | 用 `gitnexus_query` 与 `gitnexus_context` 查执行流程与符号；降级时读 `.gitnexus/AGENTS.md` 并 grep 源码 |
| 改这里会影响什么 / 哪些地方会坏 / 这个改动安全吗 | `gitnexus-impact-analysis` | 用 `gitnexus_impact` 查上游依赖，按 d=1/2/3 与置信度分级给出风险 |
| 报错了，帮我定位根因 / 这个错误从哪来 | `gitnexus-debugging` | 按错误关键词追调用链并确认根因位置；需要四阶段根因流程与回归用例时，改用 `systematic-debugging`，两者是「代码级证据」与「流程化验证」的分工，不互相替代 |
| MCP 配不上 / `gitnexus_query` 工具不存在 / 工具调不出来 | `gitnexus-setup` | 检查 npm 可达性、索引状态与编辑器配置 |
| GitNexus 有哪些工具 / 有哪些资源 URI / 图结构怎么查 | `gitnexus-guide` | 工具、资源与图 schema 速查 |
| 给这个仓建索引 / 索引过期了 / 生成项目 wiki | `gitnexus-cli` | 索引命令统一写 `npx gitnexus analyze --index-only`，避免覆盖本流程托管的 `AGENTS.md` 与 `skills/` |

## 输出表达

任何面向用户的中文说明 MUST 遵守 `helm-workflow-chat-style`（唯一真源 `references/chat-style-constitution.md`）：用完整句叙述，先给结论再展开，术语首次出现要解释含义，禁止箭头因果链与无主语片段。
`### Skills Loaded` 表 MUST 固定包含一行 `| helm-workflow-chat-style | 本地 | Skill 工具 |`。
代码块、commit message、PR body 与逐字匹配的证据表头不在此限。

### 宿主 slash 索引（真源：`references/installation/hosts-config.md`；阶段 C 后由 `scripts/hosts.json` 承载）

| 宿主 | slash_style | 示例 |
| --- | --- | --- |
| Cursor | dash | `/helm-init` … `/helm-auto` |
| OpenCode | dash | `/helm-init` … `/helm-auto` |
| Claude / CodeBuddy / ZCode（`.agents`） | colon | `/helm:init` … `/helm:auto` |
| Codex | natural | `workflow/helm-init.md` … `helm-workflow-explore` skill |

## Verification

- [ ] `complexity_mode` 与 tasks 标记一致
- [ ] 未将宿主 command 当作 canonical 编辑真源
- [ ] standard apply 前 `design_review_passed: true`

## Red flags

- standard 模式跳过 design review 或 TDD 证据
- 在 main/master 上 apply/fix（见 `helm-workflow-git-discipline`）
- Wave 1 未完成却在宿主 shell 中假设行为已对齐而跳过读 canonical skill
