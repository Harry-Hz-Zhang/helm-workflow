# AGENTS.md — HELM 源仓协作法则

> 作用域：**本仓库自身**。
> 本文件 **MUST NOT** 进入安装 payload（安装后宿主目录不得出现本文件的副本）。

## 1. 文档语言

- `README.md`、`skills/**`、`agents/**`、`templates/**`、`references/**` 正文 **MUST** 用中文。
- 代码块、命令、字段名、文件路径、YAML/JSON 键 **MUST** 保持英文原样。
- OpenSpec 结构关键字 **MUST** 保持英文：`## ADDED Requirements`、`### Requirement:`、`#### Scenario:`、`MUST`、`SHALL`。
- 例外：`skills/systematic-debugging/**` 正文为英文（第三方搬运，含 `SKILL.md` 与 `references/` 下三份参考文档），不翻译。
- 面向用户的中文说明 **MUST** 遵守 `references/chat-style-constitution.md`（完整句叙述、先结论后展开、禁止箭头因果链与无主语片段）；代码块、commit message、PR body 不在此限。

## 2. 提交信息

格式：

```
<type>[<scope>]<change-name> <中文简述>
```

- `type` 取值：`feat` / `fix` / `refactor` / `docs` / `test` / `chore`。
- `scope` 取值：`helm-parity` / `install` / `skills` / `hosts` / `meta`。
- `<change-name>` 与 OpenSpec change 目录名一致。
- 简述用中文，动词开头。

示例：

```
feat[skills][add-helm-workflow-parity] 引入 apply_mode 双旗标派生表
fix[install][add-helm-workflow-parity] 修复卸载时未先摘除 hooks 条目
```

## 3. 目录职责

| 目录 | 是否进 payload | 说明 |
| --- | --- | --- |
| `skills/` | ✅ | 唯一流程真源 |
| `agents/` | ✅（**不含 `README.md`**） | persona；`README.md` 是导航文档，不是 persona |
| `commands/helm/` | ✅ | nested 宿主薄壳 |
| `.agents/` | ✅ | nested（ZCode） |
| `.claude/` | ✅ | nested（colon） |
| `.cursor/` | ✅ | flat（dash） |
| `.opencode/` | ✅ | flat（dash） |
| `.codex/` | ✅ | workflow（自然语言） |
| `templates/` | ✅ | 模板 |
| `references/` | ✅ | 契约与范式 |
| `scripts/` | ⚠️ 部分 | `install-check` / `uninstall` / `lib` 随包；`test/` 不进包 |
| `helm-workflow.local.yaml` | ❌ | 本机态 |
| `.github/prompts/` | ✅ | flat（Copilot VS Code prompt 壳） |
| `.githooks/` | ❌ | 源仓自用 hook，不进包 |
| `reviews/` | ❌ | `code-review` / `commit-impact` 的报告落盘目录（本地产物） |

## 4. 禁止事项

- **MUST NOT** 在 `skills/` 正文写死宿主目录名（`.codebuddy/`、`.claude/`、`.cursor/`），一律用 `<AGENT_DIR>`。
- **MUST NOT** 引入第三方 npm 运行时依赖。
- **MUST NOT** 从其它产品整段搬运含内网域名、私服地址、关闭 TLS 校验（`strict-ssl` 置 false）的内容。
- **MUST NOT** 提交 `helm-workflow.local.yaml`、`.helm-version`、`.codegraph/`、`__pycache__/`。
- **MUST NOT** 把 `agents/README.md` 当作 persona 分发（它不在 `managed_files` 里）。

## 5. 验证

改动前后至少跑一次：

```bash
node --test scripts/test/*.test.mjs   # 阶段 C 之后
node scripts/verify.mjs         # 阶段 C 之后
git status --porcelain          # 确认无范围外文件
```

源仓 hook（阶段 C 之后可用）：

```bash
git config core.hooksPath .githooks
```

## 6. 事实源

- 流程事实源：`skills/*/SKILL.md`
- 加载契约：`references/skill-loading-contract.md`
- 路径解析契约：`references/workbench-resolution.md`
- 宿主事实源：`scripts/hosts.json`（阶段 C 后；之前为 `references/installation/hosts-config.md`）
- payload 事实源：`scripts/payload-skills.json` + `helm-workflow-*` 前缀
