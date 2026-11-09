# API 契约与 Apifox 同步规范

> 本文件是**唯一真源**。`helm-workflow-apply`、`helm-workflow-implement-task`、`helm-workflow-review-implementation`、`helm-workflow-verify`、`helm-workflow-code-review` 只写指针与本阶段门禁，不复制本文正文。
> 契约面的判定、写入纪律、破坏性变更的定义都在这里；流程 skill 只负责"什么时候必须读它、读不到能不能继续"。
> 门禁编号：`K` 组。skill 里引用 `K<n>` 即引用本文件条款。

## 0. 何时适用

### 0.1 启用条件（三者同时成立）

1. 画像或 `helm-workflow.local.yaml` 的 `api_contract` 取值不是 `none`。默认 `auto`：目标仓根存在 `.apifox/settings.json` 即视为启用。
2. 目标仓根存在 `.apifox/settings.json`，且其中 `projectId` 为非空整数。
3. `apifox` CLI 可执行（`apifox --version` 返回 0）。

任一不成立时：在 `log.md` 的 `### Convention Loaded` 段写一行 `api: n/a（<哪一条不成立>）`，后续只做静态检查（K7 除外），**不得**静默当成"已同步"。

### 0.2 契约面（触发本次同步的改动）

`git diff` 触及下列任一项，即判定为"触碰契约面"，本规范 MUST 生效：

| 类别 | 具体项 |
| --- | --- |
| 入口 | Controller 及其方法、路由注册、拦截器、过滤器 |
| 路径与方法 | 接口路径、路径参数、HTTP method |
| 入参 | 请求参数、请求体、DTO、`required` / `nullable`、默认值、字段名校验 |
| 出参 | 响应体、VO、嵌套结构、字段名与类型 |
| 语义 | 枚举取值、错误码、业务码、状态码、`Content-Type` |
| 安全 | 鉴权方式、鉴权范围、签名与时间戳校验 |

只改注释、格式化、日志文案、无契约面的单元测试 → 不触发，`log.md` 写 `api: n/a（无契约面改动）`。

## 1. 一次性准备

在目标仓根目录执行，逐条留存输出：

```bash
cd <项目根目录>
apifox auth login
apifox whoami
apifox project list
```

确认目标项目后，在 Apifox 项目设置里复制项目 ID，创建 `.apifox/settings.json`：

```json
{
  "projectId": 123456
}
```

规则：

| # | 规则 | 判定口径 |
| --- | --- | --- |
| K1 | 每次任务开始先读 `.apifox/settings.json` | 未读即调用任何写接口 → 门禁失败 |
| K2 | 每次任务开始确认 CLI 与登录状态 | `apifox auth status` 与 `apifox endpoint list --project <projectId>` 各执行一次，二者成功才算就绪 |
| K3 | 令牌零接触 | MUST NOT 读取、打印、复制、提交访问令牌；`.apifox/settings.json` 只允许含 `projectId` |
| K4 | `.apifox/` 入库策略 | `settings.json` 入库（不含敏感信息）；本地令牌缓存目录 MUST 进 `.gitignore` |

## 2. 项目规则落盘（写入目标仓 `AGENTS.md`）

启用本规范时，MUST 在目标仓根 `AGENTS.md` 写入下面这段长期规则。写入是**幂等**的：以 `<!-- helm:apifox-contract:begin -->` 与 `<!-- helm:apifox-contract:end -->` 为边界，已存在同段则整段替换，不存在则追加到文件末尾；文件不存在则创建。

```markdown
<!-- helm:apifox-contract:begin -->
本项目的 HTTP 接口契约统一由 Apifox 管理，projectId 为 {project_id}。当前主分支为 main。
每次处理 Apifox 相关任务前，先读取项目根目录的 .apifox/settings.json，并用 apifox auth status 与
apifox endpoint list --project {project_id} 确认 CLI、登录状态及目标项目；不得读取、打印或提交访问令牌。

只要 git diff 涉及 Controller、接口路径、HTTP method、请求参数、请求体、响应体、DTO/VO、字段名或类型、
required/nullable、默认值、枚举、错误码、鉴权方式、状态码或 Content-Type，就必须同步检查和更新 Apifox，
不得只在代码中修改。固定流程是：先查看代码、测试和 git diff；再用 METHOD + PATH 检索 Apifox 中现有接口，
必要时读取完整接口和数据模型；然后完成代码及测试；测试通过后，将非破坏性契约变化同步到 Apifox。
在 Apifox 中新建接口时必须放入对应的项目目录；修改已有接口时优先更新原接口，不要创建 method 和 path
相同的重复接口。

执行 Apifox 的 create 或 update 前，必须先运行对应的 apifox cli-schema get，生成并保存完整 JSON，
再运行 apifox cli-schema validate，校验通过后才能写入。更新前先 get 完整资源，在完整结构上修改，
禁止用局部对象直接覆盖。写入成功后必须通过 endpoint get/list 或 schema get 回读验证，
而不能只依据命令返回 success。

删除接口、重命名公开接口、修改字段类型、把可选字段改为必填、删除枚举值等破坏性变更，
必须先说明影响并取得用户明确授权。如果 AI 写入权限受限，不要静默跳过同步，也不要自行决定合并分支；
应报告权限阻塞，并询问用户是开启 AI 直接编辑权限，还是创建 AI 分支。除非用户明确要求只分析、不修改，
否则任何涉及接口实现的任务在 Apifox 尚未同步且没有明确报告阻塞时，不得直接结束。

任务结束时必须输出接口变更表，至少包含 METHOD、PATH、Apifox 接口 ID、代码位置、请求/响应变化、
是否破坏兼容、执行过的测试和 Apifox 回读结果。
<!-- helm:apifox-contract:end -->
```

规则：

| # | 规则 | 判定口径 |
| --- | --- | --- |
| K5 | 占位符必须替换 | 落盘时 `{project_id}` MUST 换成真实数字；残留占位符 → 门禁失败 |
| K6 | 幂等 | 二次执行后文件中该段只有一份；出现两份 → 门禁失败 |
| K7 | 主分支名一致 | 段落里写的主分支 MUST 与仓内实际一致（`git symbolic-ref --short refs/remotes/origin/HEAD`）；不一致时按实际值改段落 |

## 3. 每次任务的固定流程

| 步骤 | 动作 | 证据 |
| --- | --- | --- |
| 1 | 读 `.apifox/settings.json`，跑 `apifox auth status` 与 `apifox endpoint list --project <id>` | `### Apifox Sync` 段的 `preflight:` 行 |
| 2 | 看代码、测试与 `git diff`，列出受影响的契约面 | 变更表的 `代码位置` 列 |
| 3 | 用 `METHOD + PATH` 在 Apifox 检索现有接口（`apifox endpoint list --project <id>`） | `existing:` 行：命中则记接口 ID，未命中记 `none` |
| 4 | 改代码与测试，跑测试 | 复用 apply 的 Verification 证据，不重复跑 |
| 5 | 非破坏性变更写入同步：`cli-schema get` → 保存 → 改完整结构 → `cli-schema validate` → `create`/`update` | `schema:` 行的两个文件路径与 validate 结果 |
| 6 | 回读验证：`apifox endpoint get` 或 `endpoint list` | `readback:` 行 |
| 7 | 输出接口变更表 | `### Apifox Sync` 段的表格本体 |

规则：

| # | 规则 | 判定口径 |
| --- | --- | --- |
| K8 | 顺序不可颠倒 | 未完成第 1 步就执行第 5 步 → 门禁失败；未跑测试就同步 → 门禁失败 |
| K9 | 先检索后新建 | 第 3 步命中已有接口却仍 `create` 出同 `METHOD + PATH` 的重复接口 → 门禁失败 |
| K10 | 写入必须走 schema 两步 | `create`/`update` 前 MUST 有 `cli-schema get` 落盘的完整 JSON 与 `cli-schema validate` 通过记录；直接手写局部对象覆盖 → 门禁失败 |
| K11 | 回读才算成功 | 只凭命令返回 `success` 记通过 → 门禁失败；回读内容与预期不一致 → 门禁失败 |
| K12 | 新建落目录 | 新接口 MUST 放入对应项目目录；落在根目录或默认目录 → 门禁失败 |

## 4. 破坏性变更

下列改动属于破坏性变更，MUST 先说明影响并取得用户明确授权后才可执行：

| # | 变更 |
| --- | --- |
| 1 | 删除接口 |
| 2 | 重命名公开接口（路径或接口名） |
| 3 | 修改字段类型（含精度变化） |
| 4 | 把可选字段改为必填（`nullable: true` → `false`，或从非 required 变 required） |
| 5 | 删除枚举值 |
| 6 | 改变鉴权方式或新增鉴权要求 |
| 7 | 修改成功/失败状态码约定 |

授权证据 MUST 落在 `### Apifox Sync` 段的 `authorized:` 行，格式为 `authorized: <变更项> / <用户原话摘要> / <时间>`。没有用户原话的授权一律视为未授权。

非破坏性变更（新增可选字段、新增接口、补充描述、新增枚举值、放宽必填）直接同步，不需要额外授权。

## 5. 权限阻塞

写入失败且原因属于权限（403、只读令牌、非项目成员）时：

1. MUST NOT 静默跳过，MUST NOT 自行决定合并分支或改本地 mock。
2. 在 `### Apifox Sync` 段写 `blocked: <错误码与原文摘要>`。
3. 向用户报告阻塞，并给出两个选项：开启 AI 直接编辑权限，或创建 AI 分支由人工合并。
4. 用户选定前，本 change 的收口不得判"接口已同步"。

## 6. 结束产出：接口变更表

任务结束时输出下表（无契约面改动时整表写一行 `无契约面改动` 并给依据）：

| METHOD | PATH | Apifox 接口 ID | 代码位置 | 请求/响应变化 | 是否破坏兼容 | 执行过的测试 | Apifox 回读结果 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `POST` | `/api/order/submit` | `1234567` | `OrderController#submit:42` | 请求新增可选字段 `channel` | 否 | `mvn -q test -Dtest=OrderControllerTest`：12 passed | `endpoint get` 回读一致 |

`### Apifox Sync` 证据段格式（写进 `log.md`，标题逐字）：

```markdown
### Apifox Sync

- project: `123456`
- preflight: `auth status` ok；`endpoint list` 返回 43 条
- existing: `POST /api/order/submit` → `1234567`；`GET /api/order/{id}` → `none`
- schema: `.apifox/schema/order-submit.req.json`（get）、`.apifox/schema/order-submit.patched.json`（update）
- validate: `cli-schema validate` 通过（0 error）
- write: `endpoint update 1234567` → success
- readback: `endpoint get 1234567` 一致（字段数 8，required 2）
- authorized: -
- blocked: -
```

`- authorized:` 与 `- blocked:` 两行 MUST 出现，无内容时写 `-`，不得省略。

## 7. 收口门禁（K 组汇总）

apply 收口、verify、code-review 按此表判定。触发条件见 0.2。

| # | 检查 | 方式 | 失败后果 |
| --- | --- | --- | --- |
| K13 | `### Apifox Sync` 段存在且字段齐全 | 逐行读 log | 阻断 |
| K14 | 变更表覆盖本次 diff 的每个接口 | 比对 diff 里的 `METHOD + PATH` 与表格行 | 阻断 |
| K15 | 每条写入都有 `schema get` + `validate` 记录 | 读 `schema:` 与 `validate:` 行，并确认文件存在 | 阻断 |
| K16 | 每条写入都有回读结果 | 读 `readback:` 行 | 阻断 |
| K17 | 破坏性变更都有用户授权 | 读 `authorized:` 行 | 阻断 |
| K18 | 权限阻塞已报告且未被当作已同步 | 读 `blocked:` 行与用户回复 | 阻断 |
| K19 | 未创建重复接口 | `endpoint list` 中同 `METHOD + PATH` 计数为 1 | 阻断 |
| K20 | 代码里的契约描述与 Apifox 一致 | 抽查 path 参数名、required、枚举取值 | 阻断 |

未启用本规范（0.1 不成立）时，K13–K20 不判定，但 MUST 在 `### Convention Loaded` 写明 `api: n/a` 的具体原因。

## 8. 反例

| 反例 | 问题 | 正确做法 |
| --- | --- | --- |
| 改完 Controller 直接结束，说"接口没变" | 违反 K8，字段类型与 required 已变但 Apifox 仍是旧契约 | 按第 3 步走完整流程，变更表写清兼容性 |
| 为保险起见新建一个接口 | 违反 K9，同一 `METHOD + PATH` 出现两条，下游生成代码会二选一 | 先检索，命中就更新原接口 |
| 直接 `endpoint update` 传一个只含改动字段的 JSON | 违反 K10，未带出的字段会被置空 | 先 `get` 全量，改完整结构，`validate` 后写回 |
| 命令返回 success 就结束 | 违反 K11，字段可能被服务端截断或忽略 | 回读并与预期逐字段比对 |
| 把访问令牌贴进 `settings.json` 或日志 | 违反 K3，凭据会被提交进仓库 | 只用 `projectId`，鉴权交给 `auth login` 的本地缓存 |
| 权限不足时自己在本地维护一份 mock 就交付 | 违反第 5 节，契约与真实接口长期漂移 | 报告阻塞，让用户选授权方式或 AI 分支 |
