---
name: helm-workflow-code-review
description: HELM code review phase — performs a critical static review of git changes and produces an archivable Markdown code review report, without modifying code, without network access, and without reporting to any external system. Use when the user says "review this change", "help me review this", "do a code review", "generate a code review report", or "can this PR be merged".
requires_skills:
  - helm-workflow-router
  - helm-workflow-git-discipline
---

# HELM Code Review

**定位**：把「代码审查」从口头意见变成**一份可归档、可比对、可追溯的 Markdown 报告**。

**边界（MUST NOT 越界）**：

- MUST NOT 修改任何代码。发现问题的产出是「报告里的条目」，不是 patch。
- MUST NOT 联网、MUST NOT 上报到任何外部系统、MUST NOT 读取任何企业内部地址或凭据。
- MUST NOT 把本 skill 当成 `helm-workflow-apply` 的 S4 审查替代品：S4 是**实施过程中的门禁**（产出 `### Review Evidence`），本 skill 是**独立可调用的报告生成器**（产出一份 md 文件）。两者共用问题分类与维度，但证据字面量不同。

## S-1 — 前置加载（HARD-GATE）

> **前置加载**：MUST 用 Skill 工具实际加载 frontmatter `requires_skills` 的全部项（声明 ≠ 加载）；
> MUST 在本阶段日志写入 `### Skills Loaded` 证据段，声明了但未列出的依赖判为未加载；
> 任一项加载失败 → 立即停止，不得降级继续。
> 完整规则见 `references/skill-loading-contract.md`。

`### Skills Loaded` 段格式固定（三列表格，逐字）：

```markdown
### Skills Loaded

| skill | 来源 | 加载方式 |
| --- | --- | --- |
| helm-workflow-router | 本地 | Skill 工具 |
| helm-workflow-git-discipline | 本地 | Skill 工具 |
```

配置文件（`<AGENT_DIR>/helm-workflow.local.yaml`）不是 skill，**不进证据表**。

---

## S0 — 审查对象解析（MUST，先于一切输出）

### S0.1 输入形态判定（先判，再选命令）

| 输入形态 | 判定 | 处置 |
| --- | --- | --- |
| git 仓库 + 未指定范围 | `git rev-parse --show-toplevel` 成功 | 走 S0.2 表 |
| git 仓库 + 指定 sha / 分支 / range | 同上 | 走 S0.2 表 |
| **非 git 仓库**（目录、压缩包解压物） | `git rev-parse` 失败 | 只允许 `path:` 模式：整文件审查，`root` = 当前工作目录，报告「审查前提」的 scope 写 `path:<相对路径> (no-git)`，跳过所有 git 命令 |
| **一段 patch 文本**（用户直接贴） | 无仓库上下文 | 只审 patch 覆盖的行；`root` = 当前工作目录；报告 scope 写 `patch (no-git)`；行号以 patch 内 `@@` 定位为准，且 MUST 在「审查记录」注明「行号基于 patch 上下文，可能与工作区不一致」 |
| **PR 链接 / PR 号** | 无内置 PR 能力 | MUST 要求用户先 `git fetch` 出该分支，再按 `branch:<name>` 处理；拿不到分支 → 停止并让用户给分支名或 patch |

**判定不了就走不出 S0 → 停止并问，MUST NOT 猜。**

### S0.2 scope 与 diff 命令

| 用户说 | `scope` | 取 diff / 内容的方式 |
| --- | --- | --- |
| 「审查当前改动」/ 未指定 | `working` | `git diff` + `git diff --cached` |
| 「staged」 | `staged` | `git diff --cached` |
| 「审查这次提交」/ 给了 sha | `commit:<sha>` | `git show --stat --patch <sha>`；取文件内容用 `git show <sha>:<path>`（**MUST NOT** 读工作区，否则行号与 sha 不一致） |
| 「审查这个分支」/ 给了分支名 | `branch:<name>` | `git diff $(git merge-base HEAD <name>)...<name>`（审 `<name>` 相对分叉点的改动）；文件内容用 `git show <name>:<path>` |
| 「审查 last N」 | `commit-range:HEAD~N..HEAD` | `git diff HEAD~N..HEAD`；文件内容用 `git show HEAD:<path>` |
| 「审查 <路径>」 | `path:<路径>` | 直接读工作区文件（无 diff 时整文件审查） |

### S0.3 仓库根与路径

- `git rev-parse --show-toplevel` 定根；非 git 场景用当前工作目录。
- 报告里所有路径 MUST 相对该根、用 `/` 分隔、带行号。
- workbench 多仓模式：一次只审一个仓；多仓 → 报告里按仓分节，每节开头写仓名。

### S0.4 空范围处理

diff 为空且未给路径 → 输出一行 `无可审查改动（scope=<scope>）` 并结束，**不得**编造问题。

---

## S1 — 审查维度（按项目画像取，缺失按 kind 派生）

**读取维度集**：读 `<AGENT_DIR>/helm-workflow.local.yaml` 的 `profile.review_dimensions`（只读文本，按同名键匹配）。

- 命中 → 用命中的维度集。
- 未命中 → 按 `profile.project.kind` 派生（与 `helm-workflow-apply` S4 的规则同一张表，MUST NOT 另立默认）：
  `service`/`library` → `[spec, quality, security]`；`web`/`mobile` → `[spec, quality, a11y]`；`data` → `[spec, quality, data]`；`infra` → `[spec, quality, security, cost]`；`docs` → `[spec, docs]`；`multi` → `[spec, quality]`。
- 无任何画像或 `kind=unknown` → `[spec, quality]`（apply 侧对无画像同样退回这一档）。

| 维度 | 判什么 | 典型问题 |
| --- | --- | --- |
| `spec` | 改动是否真的实现了声明的需求；有无声明外改动 | 多做、少做、偏题、顺手重构 |
| `quality` | 可读性、重复、复杂度、命名、错误处理 | 复制粘贴、超过 3 层嵌套、吞异常、魔法值 |
| `bug` | 逻辑错误、空值/边界、并发、资源未释放 | 空指针、off-by-one、条件反了、连接/文件未关 |
| `security` | 注入、越权、密钥、日志泄漏、依赖风险 | 拼接 SQL、硬编码凭据、明文打日志 |
| `performance` | 复杂度、N+1、无界循环、重复 IO | 循环内查询、全量加载、无缓存 |
| `data` | 迁移可逆性、事务边界、并发写、幂等 | 无回滚、非幂等重试、丢失更新 |
| `a11y` | 语义标签、键盘可达、对比度 | div 冒充 button、无 aria-label |
| `docs` | 与行为是否一致、示例是否可跑 | 文档说 A 代码做 B、示例跑不通 |
| `cost` | 云资源、调用次数、存储增长 | 无 TTL、无分页、每请求建连接 |

**维度覆盖是硬要求**：报告 MUST 为每个生效维度写出一节小结（无问题也要写「无」）。缺一个维度 = 审查未完成。

**`bug` 缺省不在生效集内**：发现真实缺陷时，若 `bug` 不在生效维度集，仍 MUST 用 `bug` 标签记录（缺陷优先于维度裁剪），并在「生效维度与覆盖」表里补上 `bug` 行、「维度小结」补 `### bug` 节。

---

## S2 — 审查方法（三个前置问题 + 逐文件 + 跨文件）

### S2.1 三个前置问题（必须先答，写进报告「审查前提」节）

1. 这改动在解决**真实**问题，还是臆想问题？
2. 有没有**更简单**的做法能达成同一效果？
3. 这会**破坏**哪些现有行为？

答不上来（例如拿不到需求来源）→ 在报告里如实写 `无法判定`，**不得**用猜测填空。

### S2.2 逐文件审查

对范围内每个文件：

1. 读**审核基准版本**的完整文件（不是只看 diff 片段）—— 基准版本必须与 scope 一致：`working`/`staged`/`path` 读工作区；`commit:<sha>` 用 `git show <sha>:<path>`；`branch`/`commit-range` 用 `git show HEAD:<path>`。读错基准 → 行号不可信，报告作废。
2. 检查该文件所属维度的问题清单。
3. 记录候选问题（这一步不下结论）。

### S2.3 跨文件一致性

- 同一概念在不同文件的命名/语义是否打架。
- 接口改动是否同步了所有调用方（grep 被改符号）。
- 新增配置项是否有消费点（定义了没人读 = 死配置）。
- 新增文件是否有清理路径（装了没人卸 = 残留）。

---

## S3 — 报告生成（唯一交付物）

**必须落盘为文件**，MUST NOT 只在对话里贴。

### S3.1 落盘位置

`<change_root>` 取 `profile.change_root`，缺省 `.openspec/changes`（`spec_source != openspec` 时为 `helm/changes`）。`<root>` 为项目根；workbench 多仓模式下报告放 **workspace 根**下的 `reviews/`。

优先级（取第一个可用）：

1. 存在活动 change → `<root>/<change_root>/<change-name>/code-review-<YYYY-MM-DD>.md`
2. 否则 → `<root>/reviews/code-review-<YYYY-MM-DD>.md`

- 目录不存在 → **先创建**（`reviews/` 是报告目录，不在 `AGENTS.md` 的 payload 职责表内，属本地产物）。
- 同一天多次审查：文件名追加 `-<HHmm>`（如 `code-review-2026-03-18-1430.md`），**MUST NOT 覆盖**已有报告（报告是历史证据，覆盖即丢失）。
- 报告是本地产物，**MUST NOT** 提交到 payload（`skills/`、`templates/`、`agents/`、`commands/`）。

### S3.2 报告骨架

从 `templates/code-review-report.md` 复制，逐节填写。**节标题不得改名**：

```markdown
# Code Review — <scope 摘要>

## 审查前提
## 代码品味评级
## 生效维度与覆盖
## 关键问题（必须修复）
## 改进建议（建议修复）
## 样式备注
## 维度小结
## 合并建议
## 核心洞察
## 审查记录
```

### S3.3 问题条目格式（MUST 逐字遵守）

```text
- [<维度>][<严重度>] <相对路径>:<行号或行号区间>
  问题：<一句话说清是什么错，不是"可能有问题">
  影响：<不修会发生什么>
  修复：<具体动作，能落到文件与符号>
```

- `<维度>` ∈ S1 表中的值。
- `<严重度>` 三档，判定标准如下（MUST 照此分级，不得凭感觉）：

  | 严重度 | 判定标准 |
  | --- | --- |
  | `blocker` | 数据丢失/损坏、安全漏洞、主流程不可用、编译或启动失败、契约破坏且无兼容路径 |
  | `major` | 功能错误（有明确错误输入/错误结果）、明确回归、资源泄漏、错误处理缺失导致崩溃 |
  | `minor` | 可维护性、可读性、命名、重复、缺注释、日志不当，不影响正确性 |

- 路径 MUST 相对仓库根、用 `/`、MUST 带行号；单行 `:45`，区间 `:45-52`。
- 一条问题一行标题，**MUST NOT** 把多个问题塞进一条。
- 「影响」与「修复」不得为空。写不出影响 = 这条不是问题，删掉。

### S3.4 品味评级（三档互斥，按顺序判定，命中即停）

| 顺序 | 评级 | 判定线（命中即定级，不再往下判） |
| --- | --- | --- |
| 1 | 🔴 需要改 | 存在任一 `blocker` |
| 2 | 🟡 可接受 | 无 `blocker`，且（`major` ≥ 3 **或** 存在跨文件一致性疑点） |
| 3 | 🟢 好品味 | 无 `blocker`、`major` ≤ 2、无跨文件一致性疑点 |

### S3.5 合并建议（三档互斥，按顺序判定）

| 顺序 | 建议 | 判定线 |
| --- | --- | --- |
| 1 | ❌ 需要重做 | 存在 `blocker`，或改动方向与需求不符 |
| 2 | ⚠️ 有条件合并 | 无 `blocker`，但存在用户**尚未明确接受**的 `major`（接受 = 用户在本次对话中明确说「这条先不管」） |
| 3 | ✅ 可以合并 | 无 `blocker`，且无未接受的 `major` |

**MUST 给明确结论**，不得写「建议酌情处理」。存在待用户决策的 `major` 时，向用户提问接受与否，**不得**自行假定接受。

---

## S4 — 交付与复述

1. 报告写完后，在对话里输出**摘要**（不是全文）：

   ```text
   Code Review 完成
   - 报告：<报告相对路径>
   - 范围：<scope>（<N> 个文件，+<a>/-<d> 行）
   - 评级：<🟢/🟡/🔴>
   - 关键问题：<n> 条（blocker <b> / major <m>）
   - 建议：<✅ 可以合并 / ⚠️ 有条件合并 / ❌ 需要重做>
   ```

2. MUST 在 `## 审查记录` 节写出**实际执行过的命令**与审查时间。

3. MUST NOT 在报告里写入本地绝对路径、用户名、机器名、凭据、内部地址。

---

## 与其他 skill 的关系

| 场景 | 用哪个 |
| --- | --- |
| 实施过程中每个 task 的审查门禁 | `helm-workflow-apply` 的 S4（产出 `### Review Evidence`） |
| 实施完成后、合并前的独立审查报告 | **本 skill** |
| 只想知道「这次改了什么、该测什么」 | `helm-workflow-commit-impact` |
| 报告里有 `blocker` 要修 | `helm-workflow-fix` |

## 交付前自检（MUST 逐项打勾）

- [ ] `### Skills Loaded` 是三列表格且覆盖 `requires_skills` 全部项。
- [ ] 报告文件已落盘，路径符合 S3.1，未覆盖已有报告。
- [ ] 十个小节标题齐全，未改名。
- [ ] 每条问题都有 `维度/严重度/路径:行号/问题/影响/修复` 六要素。
- [ ] 所有路径都是相对路径且带行号。
- [ ] 每个生效维度在「维度小结」都有小结（无问题写「无」）。
- [ ] 评级与合并建议符合 S3.4/S3.5 的互斥判定顺序。
- [ ] 报告里无绝对路径、无用户名、无内部地址、无凭据。
- [ ] 未修改任何代码（`git status` 相对审查前无新增改动）。

## 禁止

- 禁止改代码、禁止顺手修。
- 禁止联网、禁止上报、禁止调用任何外部审查服务。
- 禁止把「可能 / 也许 / 建议关注」写成问题条目 —— 不确定就不写。
- 禁止跳过「审查前提」直接给结论。
- 禁止覆盖已有报告文件。
- 禁止用错审核基准（`commit:<sha>` 读工作区）。
