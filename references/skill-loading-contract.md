# 前置 Skill 加载契约（Skill Loading Contract）

> 本文件是**唯一真源**。所有 `helm-workflow-*` 阶段 skill 只允许引用本文件，不得复制其正文。
> 违反此规则会被 `scripts/verify.mjs` 的重复段落扫描标记。

## 0. 路径基准

- 本文件以及所有 `skills/**` 正文中出现的**仓库内文件引用**，一律是**仓库根相对路径**。
- 例：`references/skill-loading-contract.md` 指仓库根的 `references/` 目录，**不是** `skills/<name>/references/`。
- 宿主侧路径一律用 `<AGENT_DIR>/...` 占位，禁止写死 `.claude/`、`.cursor/` 等具体目录名。
- 禁止在 skill 正文出现与本机相关的绝对路径（`/Users/...`、`D:\...`、`/home/...` 等）。

## 1. 声明规则

每个阶段 skill 的 frontmatter MUST 含 `requires_skills` 字段：

- 有依赖：YAML 数组，每项是 skill 目录名（不带命名空间时表示本地 skill）。
- 无依赖：写 `requires_skills: []`（空数组），**不得省略该字段**。
- 外部依赖：写全命名空间，如 `superpowers:test-driven-development`。

`requires_skills` 是**声明**，不是**执行**。声明了不等于加载了。

## 2. 加载规则（HARD-GATE）

进入任一阶段 skill 的正文流程前：

1. MUST 用 Skill 工具（或宿主的等价机制）实际加载 `requires_skills` 列出的每一项。
2. MUST NOT 以"我已经知道那个 skill 的内容"为由跳过。
3. MUST NOT 只加载第一层依赖。若被依赖的 skill 自身又声明了依赖，第二层也 MUST 加载，或由本契约明确豁免（见第 4 节）。
4. 任一依赖加载失败 → MUST 停止流程，不得降级继续。

## 2.5 依赖缺失时的处置（通用环境必需）

| 依赖类型 | 判定 | 缺失时行为 |
| --- | --- | --- |
| **本地**（`skills/<name>/` 随包分发） | 目录存在 | 缺失 → **硬停**（安装不完整，先 `helm-workflow check`） |
| **外部 T0**（带命名空间，如 `superpowers:*`、`writing-plans`） | 不在 `skills/` 下 | 缺失 → **降级继续**：log 记 `WARN: <skill> missing (external)`，改用本 skill 内联的最小规则执行，并在 `### Skills Loaded` 表把"加载方式"写 `缺失-降级` |

理由：外部 T0 skill 需额外插件市场或公网，企业内网/离线环境常不可得；若一律硬停，整条流程在干净机器上不可用。
**MUST NOT** 把本地依赖也降级——本地缺失说明安装坏了，继续跑只会产出无证据的结论。

## 3. 证据格式（可机械校验）

执行任何阶段 skill 时，工作日志 MUST 含一段 `### Skills Loaded`，格式固定：

```markdown
### Skills Loaded

| skill | 来源 | 加载方式 |
| --- | --- | --- |
| helm-workflow-router | 本地 | Skill 工具 |
| superpowers:test-driven-development | T0 | Skill 工具 |
```

规则：

- 段标题 MUST 是 `### Skills Loaded`（三级标题，逐字）。
- 表头 MUST 是 `skill` / `来源` / `加载方式` 三列。
- `来源` 取值：`本地` / `T0`。
- 声明了但未出现在表中的依赖，MUST 判为**未加载**，流程 MUST 停止。

## 4. 间接依赖归属

`requires_skills` 只声明**直接**依赖。间接依赖由被依赖 skill 自己负责，调用方不重复加载。

例外：若被依赖 skill 的核心规则完全外包给某个 T0 skill（例如 `helm-workflow-implement-task` 的 RED→GREEN→REFACTOR 完全依赖 `superpowers:test-driven-development`），则该 T0 skill MUST 在**调用方**的 `requires_skills` 中也列出。

判断标准：**如果缺少 B，A 就无法执行**，则 B 必须写进调用方。

## 5. 最小内联摘要（允许且要求）

各阶段 skill MUST 保留 3–5 行内联摘要，用于宿主未加载本文件时兜底。摘要必须包含：

1. 一句"必须用 Skill 工具加载 `requires_skills` 全部项"。
2. 一句"必须写入 `### Skills Loaded` 证据段"。
3. 一句"未加载即停止"。
4. 一行指针：`详见 references/skill-loading-contract.md`。

摘要 MUST NOT 超过 5 行；超过即视为复制，判违规。

## 6. 检查清单

`scripts/verify.mjs` 会检查：

- [ ] 每个 `skills/*/SKILL.md` 都有 `requires_skills` 字段
- [ ] 每个 `helm-workflow-*` skill 正文含 `### Skills Loaded`
- [ ] 无 skill 复制超过 5 行的加载门禁正文
- [ ] `helm-workflow-router` 的 `requires_skills` 含 `helm-workflow-chat-style`
- [ ] 四个 persona 都带 `references/chat-style-constitution.md` 指针
- [ ] Cursor 规则与 Copilot instructions 都带 `references/chat-style-constitution.md` 指针
- [ ] `templates/log.md` 的 `### Skills Loaded` 示例表含 `helm-workflow-chat-style` 行

## 7. 横切约束 skill

`helm-workflow-chat-style` 是横切约束 skill。它不占阶段、不产出交付物，只约束 agent 面向用户的中文表达。

- **声明位置唯一**：`skills/helm-workflow-router/SKILL.md` 的 `requires_skills`。
- **传递方式**：每个阶段 skill 的 `requires_skills` 都含 `helm-workflow-router`，因此该约束随 router 传递到全部阶段；各阶段 skill 不重复声明（见第 4 节）。
- **证据要求**：`### Skills Loaded` 表 MUST 含一行 `| helm-workflow-chat-style | 本地 | Skill 工具 |`。
- **适用范围**：面向用户的中文说明。代码块、commit message、PR body 与逐字匹配的证据表头不在此限。正文真源是 `references/chat-style-constitution.md`。
- **违规判定**：面向用户的结论里出现箭头因果链、无主语片段或未解释缩写，即判本 skill 未执行，该段输出 MUST 重写后再发送。
