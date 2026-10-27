---
name: helm-workflow-commit-impact
description: HELM impact-analysis phase — derives affected entry points (sync and async), data and environment preparation, and an executable regression test checklist from a commit or diff, then writes a Markdown report without modifying code and without network access. Use when the user says "what does this change affect", "what should be tested", "produce a test checklist", or "assess the blast radius before release".
requires_skills:
  - helm-workflow-router
  - helm-workflow-git-discipline
---

# HELM Commit Impact

**定位**：把「这次改了什么」翻译成「**必须验证什么**」，输出一份别人能照着执行的测试清单。

**边界**：

- MUST NOT 修改任何代码或测试文件。
- MUST NOT 联网、MUST NOT 上报、MUST NOT 写任何企业内部地址、MUST NOT 写配置的真实值（**只写键名**，值一律用 `<占位>`）。
- MUST NOT 把「建议测一下 X」当成结论 —— 每条测试步骤必须可执行、带断言。

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

## S0 — 输入与范围锁定

### S0.1 输入形态判定（先判，再选命令）

| 输入 | 分析范围 | 是否需要 git |
| --- | --- | --- |
| 一个 commit sha | `git show --stat --patch <sha>` | 需要 |
| 一段 range（`A..B`） | `git diff --stat A..B` + 逐文件 patch | 需要 |
| 分支名 | `git diff $(git merge-base HEAD <name>)...<name>`（分析 `<name>` 相对分叉点的改动） | 需要 |
| 未提交改动 | `git diff` + `git diff --cached` | 需要 |
| 一段 patch 文本 | 直接解析文本 | **不需要**：跳过本节「必做的三件事」中所有 git 命令，`root` = 当前工作目录，报告「变更范围」的 scope 写 `patch (no-git)` |
| 非 git 目录 / 一批路径 | 逐文件读全文 | **不需要**：scope 写 `path:<...> (no-git)` |

`git rev-parse --show-toplevel` 失败且用户没给 patch/路径 → 停止并问，不得猜。

### S0.2 必做的三件事（git 输入时）

1. `git rev-parse --show-toplevel` 定根；报告里路径一律相对根、用 `/`。
2. `git diff --stat` 拿到「文件数 / 增删行数」，写进报告「变更范围」。
3. 按文件扩展名与路径特征给每个文件打**变更类别**标签（见 S1）。

`patch` / 非 git 输入时只做第 3 件（规模与类别从文本推算）。

**空 diff** → 输出一行 `无可分析改动` 并结束。

---

## S1 — 变更分类（决定影响面怎么推）

| 类别 | 判定信号（路径/内容特征） | 默认影响面 |
| --- | --- | --- |
| `api` | 控制器 / 路由 / 接口定义 / schema / OpenAPI | 所有调用方、契约回归、鉴权 |
| `domain` | service / usecase / 领域模型 | 业务主流程、边界值、并发 |
| `data` | 迁移脚本 / DDL / ORM 映射 / SQL | 存量数据兼容、回滚、索引 |
| `async` | 消息生产/消费 / 定时任务 / 事件 / webhook | 重放、幂等、乱序、死信 |
| `config` | yaml / json / toml / env / 特征开关 | 生效范围、默认值、回滚开关 |
| `build` | 依赖清单 / 构建脚本 / CI | 全量重建、锁文件一致性 |
| `docs` | `*.md` / 注释 | 文档与实现一致性（一般无运行时影响） |
| `test` | 测试文件 | 覆盖率变化，**不计入生产影响面** |
| `infra` | Dockerfile / k8s / IaC | 部署顺序、资源配额、权限 |

**跨类别规则**：一个文件可同时属于多类（例如改了 interface 与 impl），**每类都要单独推影响面**。

---

## S2 — 影响入口推导（必须两类都过一遍）

### S2.1 同步入口（表 A）

列集以 `templates/commit-impact-report.md` 为唯一真源：`# / 入口类型 / 定位 / 请求或入参关键字段 / 期望结果`。

| 入口类型 | 定位方式 | 必填列（模板列） |
| --- | --- | --- |
| HTTP 接口 | grep 路由注册 / 注解 / 装饰器 | 方法 + 路径、请求体关键字段、期望状态码 |
| CLI 命令 | grep 命令注册 | 命令 + 参数、退出码 |
| 库函数 | grep 被改符号的所有调用点 | 调用方、入参约束 |
| 文件读写 | grep 被改的路径常量 | 输入文件形态、输出副作用 |

### S2.2 异步与间接入口（表 B）

列集同样以模板为唯一真源：`# / 入口类型 / 定位 / 触发条件 / 幂等键 / 降级/重试`。

| 入口类型 | 定位方式 | 必填列（模板列） |
| --- | --- | --- |
| 消息消费 | grep topic / queue / 订阅注册 | topic、消息体、幂等键 |
| 定时任务 | grep cron / scheduler / 注解 | 触发周期、单次幂等性 |
| 事件回调 | grep listener / hook / webhook | 触发条件、重试策略 |
| 缓存 | grep 被改的 key 前缀 | 失效时机、脏读窗口 |
| 下游依赖 | grep 被改的客户端调用 | 超时、降级、重试 |

**不适用写 `—`，不得留空、不得省略列。** 缓存/下游天然没有幂等键，`幂等键` 列写 `—` 即可。

### S2.3 空表处置

- 本次改动不含 `api`/`domain` → 表 A 写一行 `无（本次改动类别：<...>）`，并在「变更范围」注明判定依据。
- 本次改动不含 `async` → 表 B 同样处理。
- **只有 `docs`/`test` 类改动时**：表 A、表 B 都写「无」，测试步骤给 1 条文档/测试自身一致性验证即可，其余类型写「不适用 + 理由」。

### S2.4 触发链补齐

对表 A/表 B 里每一个入口，向上追一层：

- 它被谁触发？（上游接口 / 上游消息 / 人工操作）
- 它触发谁？（下游调用 / 落库 / 发消息）
- 追到「没有改动」的那一层为止。

链条写进报告时用箭头表示：`A-1 <入口> → <中间层> → <被改符号> → <落库/发消息/下游>`。

---

## S3 — 数据与环境准备

对每个 `data` / `config` 改动，逐条给：

1. **前置数据**：需要先存在什么数据（具体字段值，不是"准备一些数据"）。
2. **迁移/回滚**：执行顺序、回滚语句、回滚后如何验证。
3. **环境差异**：本地 / CI / 预发 三处行为是否有差异（时间源、时区、随机数、并发度）。
4. **开关**：是否有 feature flag；**只写键名**，如何关掉（关掉后应观察到什么）。

本次无 `data`/`config` 改动 → 「数据与环境准备」写 `不适用（本次无 data/config 改动）`，不得留空表格。

---

## S4 — 测试清单（核心产出）

### S4.1 步骤格式（MUST 逐字遵守）

```text
### 步骤 <章节>.<序号>：<一句话说明这条要验什么>

- 前置：<数据 / 环境 / 开关状态>
- 操作：<可复制执行的命令，或精确到字段的界面操作>
- 断言：<可判定的结果；禁止"正常返回"这类模糊说法>
- 覆盖：<对应的入口编号，取值形如 A-1 / B-2>
- 失败采集：<失败时要抓什么：日志位置 / 关键字段 / 请求 id / git rev-parse HEAD>
```

规则：

- 一个步骤只验一件事。
- 断言 MUST 可判定（状态码、字段值、行数、退出码、日志字面量）。
- 覆盖列 MUST 指向表 A / 表 B 的具体行（`A-1`、`B-2` 格式），**不得为空**；整表为「无」时写 `N/A(<类别>)` 并给理由。
- 步骤编号 MUST 连续，不得跳号。
- **失败采集 MUST 写明**：该步骤失败时要采集什么（日志位置、关键字段、`git rev-parse HEAD`、请求 id），否则排障时无据可依。

### S4.2 必须覆盖的四类

| 类型 | 至少几条 | 举例 |
| --- | --- | --- |
| 主流程（happy path） | 每个同步入口 1 条 | 正常参数 → 200 + 落库 |
| 边界与异常 | 每个改动的判定分支 1 条 | 空值 / 超长 / 越界 / 无权限 |
| 异步与幂等 | 每个异步入口 1 条 | 同一条消息投两次 → 只生效一次 |
| 回归（不破原有） | 每个 `api` 改动 1 条 | 旧调用方式仍可用 |

某类无可覆盖对象 → 在「覆盖度自查」表里写 `不适用` 并给一行理由（例如 `无异步入口`），**不得**写成 0 条却无解释。

### S4.3 不要写的东西

- 不要写「跑一遍全量回归」——不是可执行步骤。
- 不要写「确认功能正常」——不可判定。
- 不要写与本次改动无关的历史欠债（写进「待确认项」）。

---

## S5 — 报告落盘

### S5.1 位置

`<change_root>` 取 `profile.change_root`，缺省 `.openspec/changes`（`spec_source != openspec` 时为 `helm/changes`）。`<root>` 为项目根；workbench 多仓模式下报告放 **workspace 根**下的 `reviews/`。

优先级：

1. 存在活动 change → `<root>/<change_root>/<change-name>/commit-impact-<YYYY-MM-DD>.md`
2. 否则 → `<root>/reviews/commit-impact-<YYYY-MM-DD>.md`

- 目录不存在 → **先创建**。
- 同一天多次分析：文件名追加 `-<HHmm>`，**MUST NOT 覆盖**已有报告。
- 报告是本地产物，**MUST NOT** 提交到 payload。

### S5.2 骨架

从 `templates/commit-impact-report.md` 复制，逐节填写。**节标题不得改名**：

```markdown
# Commit Impact — <范围摘要>

## 变更范围
## 影响范围
### 同步入口（表 A）
### 异步与间接入口（表 B）
## 触发链
## 数据与环境准备
## 测试过程
## 测试步骤
## 待确认项
## 分析记录
```

### S5.3 分析记录（MUST）

`## 分析记录` 节 MUST 写：分析时间（`YYYY-MM-DD HH:mm`）、**实际执行过的命令**（`git show` / `git diff --stat` / grep 命令原样）、分析者。未写命令 = 报告不可复核。

### S5.4 交付摘要

在对话里只输出摘要：

```text
Commit Impact 分析完成
- 报告：<相对路径>
- 变更：<N> 个文件，+<a>/-<d> 行；类别 <api, data, ...>
- 影响入口：同步 <n> 个 / 异步 <m> 个
- 测试步骤：<k> 条（主流程 <a> / 边界 <b> / 异步 <c> / 回归 <d>）
- 待确认项：<t> 条
```

---

## 与其他 skill 的关系

| 场景 | 用哪个 |
| --- | --- |
| 「这次改动该测什么」 | **本 skill** |
| 「这段代码写得好不好」 | `helm-workflow-code-review` |
| 实施完成后按规格核对 | `helm-workflow-verify` |
| 按清单实际执行测试并留证 | `helm-workflow-verify` 的证据块 |

## 交付前自检（MUST 逐项打勾）

- [ ] `### Skills Loaded` 是三列表格且覆盖 `requires_skills` 全部项。
- [ ] 报告已落盘，路径符合 S5.1，未覆盖已有报告。
- [ ] 表 A 与表 B **都**存在：有内容，或显式写「无 + 判定依据」。
- [ ] 每个入口都做了 S2.4 的向上追一层。
- [ ] 每条测试步骤都有 `前置 / 操作 / 断言 / 覆盖 / 失败采集`。
- [ ] 断言全部可判定，无「正常」「符合预期」这类词。
- [ ] 步骤编号连续；覆盖列无空值（整表为无时写 `N/A(类别)` + 理由）。
- [ ] 四类测试都有结论（条数或不适用 + 理由）。
- [ ] 「分析记录」写了实际执行命令与时间。
- [ ] 配置只出现键名，无真实值；报告里无绝对路径、无用户名、无内部地址、无凭据。
- [ ] 未修改任何代码或测试文件。

## 禁止

- 禁止改代码、禁止顺手补测试。
- 禁止联网、禁止上报。
- 禁止把「跑全量回归」当作测试步骤。
- 禁止只给同步入口、不给异步入口（无则显式写「无」）。
- 禁止写配置真实值。
- 禁止覆盖已有报告文件。
