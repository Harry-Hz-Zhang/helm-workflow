# Changelog

本项目的所有重要变更记录于此。

格式基于 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)，
版本号遵循 [语义化版本](https://semver.org/lang/zh-CN/)。

## [0.0.1] - 2026-10-27

首个公开版本。HELM 是一套带人工闸门的规格驱动交付流程，以 skill 包形式提供，
可安装到 Claude Code、Cursor、Codex、OpenCode、ZCode、Copilot 等宿主。

### 新增

**流程阶段（13 个）**

- `init` / `new` / `explore` / `propose` / `apply` / `apply-sprint` / `fix` / `verify` / `archive` / `status` / `auto`
- `code-review`：静态审查 git 改动，产出落盘的 Markdown 报告，不联网、不改代码、不上报
- `commit-impact`：从 commit 或 diff 推导受影响入口与可执行测试清单，产出落盘报告

**横切能力**

- `helm-workflow-chat-style` 与 `references/chat-style-constitution.md`：面向中文用户的表达规范，随 router 常驻注入各 persona 与宿主规则
- `helm-workflow-router`：按意图路由到对应阶段 skill，是流程的唯一入口
- `helm-workflow-design-review` / `git-discipline` / `reverse-sync` / `review-implementation`：设计审查、提交纪律、产物与代码冲突处理、实现评审

**代码理解（可选，依赖 GitNexus）**

- `gitnexus-exploring` / `impact-analysis` / `debugging` / `cli` / `guide` / `setup`：查执行流程、评估改动影响面、按错误关键词追根因
- MCP 不可用时自动降级为读 `.gitnexus/AGENTS.md` 并 grep 源码，不阻断流程

**安装与校验**

- `scripts/install.mjs` / `install-check.mjs` / `uninstall.mjs` / `upgrade.mjs` / `cli.mjs`：多宿主安装、体检、卸载、升级
- `scripts/verify.mjs`：结构与一致性校验，覆盖 frontmatter 可解析性、模板与契约覆盖、宿主矩阵、许可声明、本机态文件与内网标识扫描
- `scripts/hosts.json` 与 `scripts/lib/host-paths.mjs`：宿主能力矩阵与路径推导的唯一真源
- `install.sh` / `install.ps1`：Linux / macOS 与 Windows 的引导脚本
- `scripts/test/`：Node 内置 `node --test` 单测，覆盖安装、升级、卸载、冲突、孤儿清理、Windows 路径
- `.githooks/pre-push`：源仓提交前的结构与证据护栏

**宿主适配**

- `.claude/`、`.agents/`、`.cursor/`、`.opencode/`、`.codex/`、`.github/prompts/` 六套命令薄壳，`commands/helm/` 为 canonical 形态
- 另在 `scripts/hosts.json` 中预留 8 个 `planned` 宿主（CodeBuddy、Windsurf、Cline、Roo、Continue、Zed、JetBrains Junie、Aider）

**配置与模板**

- `helm-workflow.local.example.yaml`：本机配置样例，五个键均标注消费位置
- `templates/`：`spec` / `tasks` / `log` / `exploration-handoff` / `helm-state.example` / `helm-auto-memory` / `implementer.context` / `reviewer.context` / `sprint-state.example` / 两份报告骨架
- `apply_mode`（`turbo` / `strict`）执行策略轴与五个派生旗标
- `### Skills Loaded` / `### Review Evidence` / `### Verification Evidence` 三类证据段，把「什么时候必须停」写成可机检的契约

### 变更

- 全部 skill 与命令薄壳的 `description` 统一为英文：宿主菜单直接展示这段文本，英文在国际用户的命令列表里可读且可排序；正文语言保持不变
- `package.json` 设 `private: true`：本包通过克隆源目录安装，不通过 npm 分发
- 命令薄壳的 `description` 由 `STAGE_DESCRIPTIONS` 单一真源驱动，`verify.mjs` 逐宿主比对，避免同一阶段在不同宿主显示不同文案
- `helm-workflow-feature` 降级为 `helm-workflow-new` 的兼容转发入口

### 许可

- 本仓原创部分以 MIT 发布，见 [`LICENSE`](./LICENSE)
- 第三方内容单独归属，见 [`THIRD-PARTY-NOTICES.md`](./THIRD-PARTY-NOTICES.md)：`skills/systematic-debugging/**` 源自 `obra/superpowers`（MIT），`skills/gitnexus-*/**` 源自 `abhigyanpatwari/GitNexus`（PolyForm Noncommercial 1.0.0，仅限非商业用途）

### 已知限制

- `install.sh` 在 Windows 上会被跳过，需用 `install.ps1`
- 8 个 `planned` 宿主尚无命令薄壳，`verify.mjs` 对它们只报 warn

