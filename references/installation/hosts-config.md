# 宿主配置说明（Hosts Config）

> 机器可读真源为 `scripts/hosts.json`；本文是**人读镜像**，两者必须一致，由 `scripts/verify.mjs` 逐宿主校验。
> 路径基准：仓库根相对路径（见 `references/skill-loading-contract.md` 第 0 节）。
> 完整能力矩阵与每类布局的薄壳模板见规划仓的 `21-HOST-MATRIX-V2.md`；本仓以 `scripts/hosts.json` 为准。

## 字段说明

| 字段 | 取值 | 含义 |
| --- | --- | --- |
| `status` | `ready` / `planned` | 只有 `ready` 允许安装；`planned` 时 `install` 以退出码 2 拒绝 |
| `maturity` | `p0` / `p1` / `p2` | 落地优先级 |
| `commandDir` | 目录模板 | 命令文件父目录；`{cluster}` 会插值成 `helm` |
| `commandName` | 文件名模板 | `{stage}` 或 `{cluster}-{stage}` |
| `commandExt` | 扩展名 | `.md` / `.prompt.md` / `.prompt` |
| `slashStyle` | `colon` / `dash` / `natural` | `/helm:apply` / `/helm-apply` / 自然语言 |
| `sourceRoot` | `root` / `host` | 该宿主薄壳在**仓库内**的源目录属于哪个根；`root` = 仓库根，`host` = 宿主目录自身 |
| `agentSource` | `root` / `host` | persona 来源；**恒为 `root`**，与 `sourceRoot` 无关 |
| `rules` | 对象 | 规则文件目录、扩展名、frontmatter 模板、触发方式 |
| `checks` | 对象数组 | 该宿主安装后必须具备的产物（`severity` = `fail` / `warn`） |
| `globalAgentDir` | 路径模板 | 全局安装落点，支持 `{home}` / `{appdata}` / `{xdgConfig}` |

## 当前矩阵

矩阵取值的**真源优先级**（严格按序）：

1. `scripts/hosts.json`（唯一机器真源）
2. 本文下表（人读镜像，用于对照与排障）

| host | status | maturity | commandDir | commandName | ext | slashStyle | sourceRoot | rules |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| claude | ready | p0 | commands/{cluster} | {stage} | .md | colon | root | false |
| codebuddy | planned | p1 | commands/{cluster} | {stage} | .md | colon | host | false |
| agents | ready | p0 | commands/{cluster} | {stage} | .md | colon | host | false |
| cursor | ready | p0 | commands | {cluster}-{stage} | .md | dash | host | true |
| opencode | ready | p0 | commands | {cluster}-{stage} | .md | dash | host | false |
| codex | ready | p0 | workflow | {cluster}-{stage} | .md | natural | host | false |
| copilot-vscode | ready | p0 | prompts | {cluster}-{stage} | .prompt.md | dash | host | true |
| windsurf | planned | p1 | workflows | {cluster}-{stage} | .md | dash | host | true |
| cline | planned | p1 | workflows | {cluster}-{stage} | .md | dash | host | true |
| roo | planned | p1 | commands | {cluster}-{stage} | .md | dash | host | true |
| continue | planned | p1 | prompts | {cluster}-{stage} | .prompt | dash | host | true |
| zed | planned | p2 | commands | {cluster}-{stage} | .md | natural | host | true |
| jetbrains-junie | planned | p2 | commands | {cluster}-{stage} | .md | dash | host | true |
| aider | planned | p2 | . | {cluster}-{stage} | .md | natural | host | true |

## 命令清单（每个 ready 宿主都必须有全套）

`STAGES`（`scripts/lib/host-paths.mjs`）是本清单的唯一真源，当前 13 个：

| # | stage | 作用 |
| --- | --- | --- |
| 1 | init | 初始化工作台与目录骨架 |
| 2 | new | 把新需求收编进 feature 容器 |
| 3 | explore | 决策树穷举与方案探索 |
| 4 | propose | 产出 OpenSpec 提案与规格 |
| 5 | apply | 按 task 串行实施（严格模式） |
| 6 | apply-sprint | 可中断恢复的冲刺式实施 |
| 7 | fix | 针对评审/验证问题的定向修复 |
| 8 | verify | 实施后验证与规格覆盖核对 |
| 9 | code-review | 静态代码审查并产出 Markdown 报告 |
| 10 | commit-impact | 影响面分析与可执行测试清单 |
| 11 | archive | 归档 change 并收尾分支 |
| 12 | status | 查看 change 进度与下一步 |
| 13 | auto | 带闸门的端到端编排 |

新增 stage 时必须同步改三处：`scripts/lib/host-paths.mjs` 的 `STAGES`、`skills/helm-workflow-<stage>/SKILL.md`、
以及每个 ready 宿主的薄壳（`verify.mjs` 会对 `ready` 宿主逐 stage 断言存在，缺失即 FAIL）。

## 新增宿主步骤

1. 在 `scripts/hosts.json` 加一条，`status` 先写 `planned`。
2. 落薄壳：按 `commandDir` / `commandName` / `commandExt` 推导出 13 个文件。
3. 补 `checks`：至少一条 `severity: "fail"` 的产物断言（`ready` 宿主的硬要求）。
4. 更新本文表格。
5. 改 `status` 为 `ready`，跑 `node scripts/verify.mjs` 与 `node scripts/cli.mjs check --all`。
