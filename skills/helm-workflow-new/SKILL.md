---
name: helm-workflow-new
description: Intake a new requirement into a feature container — collect sources, single confirm card, then create directories and fetch documents.
requires_skills:
  - helm-workflow-router
---

# HELM New

## Overview

`/helm:new` 摄入需求：**收集（仅上下文）→ 一次确认卡 → 确认后建目录并抓取文档**。

三阶段：

1. **收集**：从消息推断需求单号 / 文档链接 / 口头描述；确认前不下载、不建 `features/`。
2. **一次确认**：展示元数据、摘要、待抓取清单与缺失项；用户确认 / 补改 / 取消。
3. **执行**：幂等检查 → 建标准目录 → 直写 `10-requirements/prd/` → 写快照与 `00-feature.md` → 回写 session-context。

## When to Use

- workbench 已 init，需要创建新 feature。
- 有需求单号、需求文档链接，或仅口头描述。

## When NOT to Use

- 单仓模式（无 workbench）。
- 同名 feature 已存在（幂等保护）。

## HARD-GATE

- 同名 feature 目录已存在 → **硬停止**，报错 `Feature <name> 已存在`，不修改已有内容。
- 用户未确认前 **MUST NOT** 创建 `features/`、写入 `00-feature.md` 或回写 session-context。
- 需求来源读取失败时自动重试（上限 3 次），3 次均失败后降级（不硬停）。
- 强制 skill 仅 `helm-workflow-router`；缺则硬停。

## Process

### S1 — 强制加载前置 skill

> **前置加载（HARD-GATE）**：MUST 用 Skill 工具实际加载 frontmatter `requires_skills` 的全部项（声明 ≠ 加载）；
> MUST 在本阶段日志写入 `### Skills Loaded` 证据段，声明了但未列出的依赖判为未加载；
> 任一项加载失败 → 立即停止，不得降级继续。
> 路径基准：仓库根相对路径（见 `references/skill-loading-contract.md` 第 0 节）。
> 完整规则见 `references/skill-loading-contract.md`。

### S2 — 收集需求源（确认前，仅上下文）

**MUST NOT** 强制用户先选择「需求单 / 纯文档」路径。从用户消息推断：

1. **需求单号**（形如 `<PREFIX>-12345` 或用户明确给出的编号）。
2. **文档链接**（任意内部或外部文档站点）。
3. **其余文本**视为口头需求描述。

分流：

| 侦测结果 | 行为 |
| --- | --- |
| 有需求单号 | 读取需求正文；从正文提取文档链接；失败重试最多 3 次后降级标注 |
| 仅链接 | 收集链接列表；**确认前不下载 PRD** |
| 仅口头 | 从句子抽链接；无链接则走口头路径（`ticket_id` 为空） |
| 链接 + 口头 | 合并链接与摘要素材 |

需求单读取降级（3 次失败或读取能力缺失）：

- **不硬停**。
- 给出补装或改用链接的提示。
- 确认卡标注「需求单不可用」；后续可手补文档链接。

收集产出（仅上下文，不落盘）：

- `ticket_id`（可空）
- 需求正文摘要（若有）
- 口头 / 标题提炼的中文名候选
- 待抓取链接候选（用户提供 ∪ 需求单抽出，**默认不含**二次内链）
- 缺失项列表

**仅当关键输入无法推断时**可追问一句（例如完全空白）；不得展开多轮来源问卷。

### S3 — 组装确认卡元数据

1. 取当前日期：`$日期`=YYYYMMDD，`$年份`=YYYY，`$年月`=YYYYMM。

   目录前缀按**键名** `feature_date_granularity` 读取：

   - `YYYY`   → `<root>/features/<年>/<slug>/`
   - `YYYYMM` → `<root>/features/<年>/<年月>/<slug>/`
   - `none`   → `<root>/features/<slug>/`

   键缺失或取值不在上述三值时回退 `YYYY`，并在 log 记录
   `feature_date_granularity: <取值> (default applied)`（不得静默）。

   下文 `$前缀` = 按上述档位求得的前缀：`YYYY` → `<年>`；`YYYYMM` → `<年>/<年月>`；`none` → 空。
   非法值（如 `quarter`）按 `YYYY` 处理，记 WARN 并写 `feature_date_granularity: YYYY (default applied)`。

   **MUST NOT** 硬编码年份分支：前缀必须由 `feature_date_granularity` 派生，不得写死年份。

   样例：`<root>/features/2026/order-split/`（YYYY）、`<root>/features/2026/202610/order-split/`（YYYYMM）、`<root>/features/order-split/`（none）。

2. 提炼中文名（≤10 字）→ 目录名 `$日期_中文名` → 路径 `features/$前缀/$日期_中文名/`。
3. 生成 `label`（英文标识 ≤15 字符），输出证据行：

   ```text
   label: <值> | 长度: <N> | 是否合规: ✅/❌
   ```

   若 ❌ → 重新提炼，不得截断凑数。

4. 生成 `branch_name` 建议：
   - 有单号：`feature/{id}-{slug}`（id 去前缀小写；slug = label 的 kebab-case）
   - 无单号：`feature/{日期}-{slug}`

### S4 — 一次确认卡（唯一用户门控）

```markdown
## `/helm:new` 确认

| 项 | 值 |
|----|-----|
| 需求来源 | 需求单 / 链接 / 口头 |
| ticket_id | <可空> |
| 中文名 | … |
| 目录 | features/$前缀/$日期_中文名/ |
| label | … (长度 N) |
| branch_name | … |
| 业务摘要 | … |
| 待抓取链接 | 1. … 2. …（可空） |
| 缺失项 | … / 无 |

请回复：**确认** / **改 <项>=<值>**（可多项） / **取消**
```

- **确认** → 进入 S5。
- **改 …** → 更新卡面后再次展示（仍不落盘）。
- **取消** → 结束，不落盘。

确认前 **MUST NOT**：创建 feature 目录、写 `00-feature.md`、下载 PRD 到磁盘、回写 session-context。

### S5 — 执行：幂等检查 + 建树 + 直写抓取

1. **幂等检查**：用文件系统命令检查 `features/$前缀/$日期_中文名/` 是否存在（禁止用 Glob 做中文路径存在性）。
   - 已存在 → HARD-GATE 硬停：`Feature <name> 已存在`。
   - IO / 权限失败 → 硬停并报告。

2. **创建目录结构**：

```text
features/$前缀/$日期_中文名/
├── 00-feature.md
├── 10-requirements/
│   ├── requirement-snapshot.md
│   ├── prd/
│   └── .gitkeep
├── 20-design/
│   ├── handoffs/
│   │   └── .gitkeep
│   └── .gitkeep
└── 30-test/
    └── .gitkeep
```

- `features/$前缀/` 不存在时自动创建。
- 空目录用 `.gitkeep`；创建后 `ls` 验证，缺则补。

3. **直写抓取**（确认清单中的链接 → `10-requirements/prd/`）：
   - 用宿主提供的文档抓取能力直接写入目标文件，**输出目录为 `prd/`**。
   - MUST NOT 使用「先临时目录再 move」。
   - MUST NOT 在下载后再扫描内链并询问用户（确认后不递归）。
   - 抓取能力不可用或失败 → warn，不阻断容器创建。
   - 全部失败 → 报告标注，仍完成后续写入。
   - 落盘后检查是否为登录页 / 空壳页，是则视为失败。

4. **写 `requirement-snapshot.md`**：
   - 有需求正文 → 落盘正文 / 摘要。
   - 降级 → 写入 `<!-- 需求单不可用（已重试 3 次），以下为手动补充 -->` 及可用摘要。
   - 口头 / 无单号 → 写口头摘要或简短占位。

5. **写 `00-feature.md`**（**含已确认的 `branch_name`**）：

```yaml
---
feature: "$日期_中文名"
label: "<英文标识>"
created: "YYYY-MM-DD"
status: "active"
ticket_id: "<可空>"
branch_name: "<已确认>"
---

# <中文名>

## 背景

<!-- 从需求单 + 口头 / 已下载文档提取业务摘要。禁止技术方案与 change 拆解。 -->

## Change 清单

<!-- MUST 留空 — Change 划分是 explore 阶段的职责。 -->

| # | Change | 状态 | 涉及系统 | 依赖 | 优先级 |
|---|--------|------|---------|------|--------|
| 1 | - | - | - | - | - |
```

6. **session-context 回写**（`.state/session-context.yaml`）：

```yaml
phase: new
feature: "$日期_中文名"
active_feature: "<feature 路径>"
```

- 不存在则创建；已存在则只更新 `phase` / `feature` / `active_feature`。
- **MUST NOT** 覆盖 `active_change` 等其他字段。

### S6 — 输出确认信息

```markdown
Feature 已创建: features/$前缀/$日期_中文名/

需求来源: <需求单 <ticket_id> / 链接 / 口头>
需求快照: 10-requirements/requirement-snapshot.md ✅ / 跳过或降级
文档抓取: prd/ <N 个文档> ✅ / ⚠️ <失败详情>

目录结构:
  00-feature.md          — 元数据 + Change 清单（含 branch_name）
  10-requirements/       — 需求文档 + PRD
  20-design/handoffs/    — 预立项 handoff
  30-test/               — 测试文档

branch_name: <已确认>
label: <英文标识> (长度: <N>)

下一步:
1. 运行 /helm:explore 评估影响范围
2. explore / propose 完成后开始实现
```

## Verification

- [ ] S1 仅强制 router；无需求单不因缺读取能力硬停
- [ ] 收集阶段推断来源，无「先选来源」HARD-GATE
- [ ] 有需求单时再读正文；失败重试 3 次后降级
- [ ] 确认前不创建 features、不预下载 PRD 到磁盘
- [ ] 一次确认卡含来源 / 路径 / label / branch / 链接 / 缺失项
- [ ] 取消不落盘；改项后再次确认
- [ ] 确认后直写 `prd/`，无 temp→move
- [ ] 确认后不递归内链询问
- [ ] 抓取失败不阻断容器创建
- [ ] 同名 feature 硬停；幂等用文件系统目录检查
- [ ] `00-feature.md` 含已确认 `branch_name`；Change 清单留空
- [ ] label 证据行可见且 ≤15
- [ ] session-context 只更新 phase / feature / active_feature
- [ ] 三个空目录含 `.gitkeep`

## Red flags

- 确认前创建 feature 目录或下载 PRD 落盘
- 强制用户先选「需求单 / 纯文档」
- 使用临时目录再 move 到 `prd/`
- 下载后扫描内链并再问用户
- 独立再确认 branch（应已在确认卡完成）
- 同名 feature 覆盖已有内容
- Change 清单已填充条目
- 背景段含技术方案或 change 拆解
- 无需求单因缺读取能力在 S1 硬停
- 需求单不可用时硬停（应降级）
- 抓取失败阻断 feature 创建
- 未确认即写入 `branch_name` 或 session-context
- label 超 15 或截断凑数
- 遗漏 `.gitkeep`
- 用 Glob / 模式匹配做中文路径幂等检查
