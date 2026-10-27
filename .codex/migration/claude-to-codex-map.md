# Claude → Codex 迁移映射（六个 P0 理由）

Codex 无原生 slash 命令，全部改为自然语言触发。逐阶段映射：

| Claude | Codex | 为什么必须迁移 |
| --- | --- | --- |
| `/helm:init` | 执行 helm init | 工作台是唯一入口，缺它建不出目录骨架 |
| `/helm:new` | 执行 helm new | 需求收编是流程起点，缺它没有 feature 容器 |
| `/helm:explore` | 执行 helm explore | 决策树是复杂度判定的输入 |
| `/helm:propose` | 执行 helm propose | 没有提案就没有 tasks 与 apply_mode |
| `/helm:apply` | 执行 helm apply | 主执行路径，缺它整条流程断掉 |
| `/helm:apply-sprint` | 执行 helm apply-sprint | 可中断恢复是长任务的必要条件 |
| `/helm:fix` | 执行 helm fix | 评审问题必须能定向修复 |
| `/helm:verify` | 执行 helm verify | 证据校验是收口前提 |
| `/helm:code-review` | 执行 helm code-review | 合并前的批判性审查报告是质量闸门 |
| `/helm:commit-impact` | 执行 helm commit-impact | 影响面与测试清单是发版依据 |
| `/helm:archive` | 执行 helm archive | 归档是 change 生命周期的收尾 |
| `/helm:status` | 执行 helm status | 断点续跑依赖状态视图 |
| `/helm:auto` | 执行 helm auto | 端到端编排是编排能力的入口 |

## 差异

1. 触发方式是自然语言，不是 slash 命令：用户说 "run helm apply" 或 "执行 helm apply"。
2. 无 `argument-hint` / `allowed-tools`：参数与工具限制由会话约定，不写进 frontmatter。
3. 流程真源仍然是 `skills/`，迁移只改入口，不改流程。
