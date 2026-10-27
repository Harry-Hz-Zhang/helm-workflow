---
name: helm-workflow-explore
description: Explore phase — exhaustive decision-tree exploration, brainstorming plus OpenSpec explore, and exploration handoff. Use before propose when problem space is unclear.
requires_skills:
  - helm-workflow-router
  - superpowers:brainstorming
  - openspec-explore
---

# HELM Explore

## Overview

在提交变更前探索问题空间。本流程采用决策树穷举模型：helm-explorer 子 agent 先列出所有需要确定的决策点，主会话深度优先逐个 resolve，每个节点必有 4 种结局之一。**结构上不留"未决"垃圾桶**——handoff 落盘时所有决策树节点都已 resolved。

## When to Use

- 新需求边界不清
- 需要多方案对比或架构草图
- 用户将进入 propose/apply 但尚无 handoff

## When NOT to Use

- artifacts 已齐全且用户仅要执行 propose — 直接 `helm-workflow-propose`
- 把 explore 当作完整 spec/task 拆分授权

## HARD-GATE（探索不实现）

无论用户说「开始做」「开始实现」还是 handoff 的 `Next Step` 指向 apply，explore 都只能生成/持久化 `exploration-handoff.md` 并停止。

严禁：

- 修改业务源码、测试、配置、脚本或构建文件
- dispatch implementer、worker、apply、fix 或任何会写代码的子代理
- 创建或修改 `proposal.md`、`specs/`、`design.md`、`tasks.md` 替代 propose
- 将 handoff 或 `Next Step` 当成执行授权

允许写入仅限：`exploration-handoff.md`、`.helm-state.yaml` 的 `exploration_handoff_path`、用户明确提供的 `learnings.md`。

## Process（决策树穷举模型）

### S0 — 双模根解析（HARD-GATE，workbench 模式专属）

1. 调用 `resolveRoot()` 获取 `{ root, mode }`
   - 解析契约见 `references/workbench-resolution.md`；**MUST NOT** 自行假设返回值或在失败时回退到当前目录。
2. `mode=workbench`：
   - artifacts 根 = `<root>/.openspec/changes/<name>/`
   - 产出 feature 级 `outline-design.md`（多 change / standard 必须产出；🟢 单 change 可不写）
   - 产出 `20-design/handoffs/<change-id>.md`（每 change 一份，可 stub，propose 前写满）
   - 更新 `00-feature.md` 的 `change_candidates` 表（含 depends_on / 可并行标注）
   - 脑暴只在 explore
3. `mode=single-repo`（单库）：保持今日行为（决策树穷举 + handoff 落盘到 .openspec/changes/）

### S1 — 强制加载前置 skill

> **前置加载（HARD-GATE）**：MUST 用 Skill 工具实际加载 frontmatter `requires_skills` 的全部项（声明 ≠ 加载）；
> MUST 在本阶段日志写入 `### Skills Loaded` 证据段，声明了但未列出的依赖判为未加载；
> 任一项加载失败 → 立即停止，不得降级继续。
> 路径基准：仓库根相对路径（见 `references/skill-loading-contract.md` 第 0 节）。
> 完整规则见 `references/skill-loading-contract.md`。
   - 苏格拉底式提问节奏（一次一问、依赖驱动、最小问题集）以 `superpowers:brainstorming` 为唯一权威；本 SKILL 不重写其规则

### S2 — 决策树提取

> 并发上限：派发 `helm-explorer` 子任务的最大并发取 `helm-workflow.local.yaml` 的 `explore_max_concurrency`（默认 5）；配置缺失时用默认值，不得静默改成其它值。

1. **决策树提取（MUST，派发 helm-explorer 子 agent 执行）**：
   主会话读取需求来源后，派发 helm-explorer 子 agent 探索代码并列出**决策树**——所有需要在 explore 阶段确定的决策点。

   **需求来源（按 S0 的 mode 分流）**：
   - `mode=workbench`：读取 `10-requirements/requirement-snapshot.md` + `10-requirements/prd/` 下所有 PRD 文档。PRD 是**业务真相源**（接口定义、业务规则、验收标准），PRD 为空 → 降级仅用 需求快照
   - `mode=single-repo`：读取用户输入的 handoff 主题描述 + `.openspec/changes/<name>/exploration-handoff.md`（若存在）

   覆盖至少以下类别：

   | 类别 | 示例决策点 |
   | --- | --- |
   | 战略 | 目标、范围、change 划分（独立 vs 扩展现有 change） |
   | 命名 | 类名、接口名、方法名、变量名、枚举名、包路径、目录结构、文件名规则、命令名 |
   | 选型 | 复用既有 vs 新建、串行 vs 并行、≥2 方案对比并选定 |
   | 数值/常量 | 枚举具体取值、超时阈值、并发上限、缓存 key 前缀 |
   | 依赖核实 | 某类/方法/常量"是否已存在" |

   决策树须含**依赖关系**：若 B 依赖 A，A 必须先 resolve。explorer 输出形如：

   ```
   - D1 [战略] change 划分：独立 vs 扩展 (无依赖)
   - D2 [命名] 类名 (依赖 D1)
- D3 [依赖核实] PageCursor 类是否存在 (无依赖)
  ...
  ```

### S3 — 深度优先遍历

1. **深度优先遍历（MUST，主会话执行）**：拓扑排序后逐节点处理，**提问节奏严格遵循已加载的 `superpowers:brainstorming`**（一次一问、依赖驱动、用户答复触发下一问）。每个节点必有 4 种结局之一：

   - **A) 用户当下答**：按 brainstorming 节奏向用户发起**单节点**追问，停止并等用户答复 → 节点 resolved，写入「决策清单」，来源=**用户原话**（verbatim 引用）
   - **B) 代码可查**：派发 helm-explorer 子 agent 读代码确认 → 节点 resolved，写入「决策清单」，来源=**file:line**
   - **C) 用户明确延迟决策**：用户在会话中**字面说过**"propose 再定 / 先放着 / 我跟产品确认完再回你" → 节点 resolved，写入「决策清单」，来源=**用户延迟决策（带用户字面原话）**
   - **D) 客观无法解决**：仅以下两种情形：
     - `外部依赖`：等其他团队/系统/接口返回，本次 explore 拿不到
     - `技术限制`：本机 CLI/SDK/环境不可用，需线下/本机验证
     → 节点写入「客观阻塞」，**禁止**写入「决策清单」

   **结构性约束（防 AI 偷懒）**：
   - 没有第 5 种结局。AI 若想留空 → 必须回到 A 当场问用户
   - "本次 explore 未提及" / "用户未明确" / "暂未讨论" 等 AI 自己代笔的句子**不是任何结局**，自检会挡停
   - C 的引号内必须含"我 / 我们 / 咱"任一字符（用户第一人称口吻），否则视为伪原话
   - "某类是否存在"必须走 B（helm-explorer 子 agent 读代码），不得用 A/C/D 兜底
   - 若主会话发现自己在违反一次一问/依赖驱动等节奏 → 那是 brainstorming 没真加载，回 S1 修复，不是在本 SKILL 重写规则

### S4 — handoff 落盘前自检

1. **handoff 落盘前自检（MUST，机械扫描）**：
   - 遍历决策树记录：任一节点状态非 A/B/C/D → 停止，回 S3 继续 resolve
   - 扫「决策清单」段：每条必须有"来源"字段；来源为 C（用户延迟决策）时引号内：
     - 不得含子串：`未提及` / `未涉及` / `未说明` / `未指定` / `未明确` / `未讨论` / `尚未` / `暂未` / `待后续` / `本次未`
     - 必须含字符：`我` / `我们` / `咱` 任一
   - 扫「客观阻塞」段：理由**只能**两选一（`外部依赖` / `技术限制`）；含其他理由 → 停止
   - 自检失败 → **不**落盘，**不**调用 `mcp__cowork__present_files`，**不**建议 propose/apply
   - 自检失败时主会话输出："决策树穷举未完成，以下节点需先 resolve：<列表>"，附每个节点违规原因，然后等待用户回答

### S5 — Handoff 落盘

1. **Handoff 落盘**（自检通过后）：
   - 读取 `templates/exploration-handoff.md` 模板（3 段：决策清单 / 客观阻塞 / 下一步建议）
   - 禁止写：正式设计合同、完整验收、完整 task 拆分、**任何"未决问题 / Open Questions / 暂未确定"段**
   - 有 active change → `.openspec/changes/<name>/exploration-handoff.md` 并回写 `.helm-state.yaml.exploration_handoff_path`
   - 无 change → 宿主 runtime 目录 `last-exploration-handoff.md`，propose 后须回写到 change
   - 输出 handoff 路径与「下一步建议」后才建议 propose/apply
   - 可选 learnings 写入 change 的 `learnings.md`

## Verification

- [ ] log 含 `### Skills Loaded` 段，且 `superpowers:brainstorming` 在列表中（实际 Skill 工具调用过，非仅元数据声明）
- [ ] helm-explorer 子 agent 已产出决策树，覆盖战略 / 命名 / 选型 / 数值 / 依赖核实 5 类
- [ ] 决策树每个节点状态为 A/B/C/D 之一，无 OPEN/未决
- [ ] 「决策清单」每条来源字段非空且可验证（用户原话 verbatim / file:line / 用户延迟决策含字面原话）
- [ ] B 结局 helm-explorer 子 agent 已读代码确认，来源标注 file:line
- [ ] 「客观阻塞」理由仅 外部依赖 / 技术限制 两选一
- [ ] handoff 未含「未决问题 / Open Questions / 暂未确定」段
- [ ] handoff 未越权写入正式 proposal/specs/tasks 约束
- [ ] explore 阶段未修改业务源码

## Red flags

- helm-explorer 子 agent 未列决策树就开始追问（无法判断穷举完毕）
- 决策树存在 OPEN 节点仍生成 handoff
- B 结局未派发 helm-explorer 子 agent 读代码确认（主会话自行 grep 代替）
- handoff 出现「未决问题 / Open Questions / 暂未确定 / 待 propose 定型」段
- 「决策清单」条目无来源字段
- 用户延迟决策（C）引号内是 AI 代笔的"用户未明确" / "本次未提及" 等
- 用户延迟决策（C）引号内是第三人称叙述（"用户没说..."）而非第一人称（"我先看看"）
- "某类是否存在"未由 helm-explorer 子 agent 读代码确认就甩到「客观阻塞」
- 「客观阻塞」理由不是 外部依赖 / 技术限制 两选一
- 用户说「不用了」时未检查决策树覆盖度就直接落盘
- 自检未跑就调用 present_files 或建议 propose
- **brainstorming 没真加载就开始追问**：进入 S2 时 log 缺 `### Skills Loaded` 段或不含 `superpowers:brainstorming`。一切提问节奏违规（Q1/Q2/Q3 批量、"请回答以下问题"清单、不等用户答复就提下一问）本质都是这个根因，回 S1 强制 `Skill` 工具调用才是正解
- 把 `requires_skills` 元数据当作"已加载"——它只是声明
