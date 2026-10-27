---
name: gitnexus-setup
description: Load when the user needs to wire the GitNexus code graph into the editor, troubleshoot unavailable MCP tools, or confirm configuration readiness before use. Triggers on "MCP will not connect", "gitnexus_query does not exist", and "the tool cannot be invoked".
requires_skills: []
---

<!--
  Describes abhigyanpatwari/GitNexus (https://github.com/abhigyanpatwari/GitNexus),
  which is distributed under the PolyForm Noncommercial License 1.0.0.
  Required Notice: Copyright Abhigyan Patwari.
  See THIRD-PARTY-NOTICES.md. Noncommercial use only.
-->

# GitNexus MCP 配置指南

## 概述

GitNexus 有两类用法，对配置的要求不同。

| 类型 | 使用方式 | 是否需要 MCP 配置 |
| --- | --- | --- |
| 命令行 | `npx gitnexus analyze --index-only`、`status`、`clean`、`wiki` | 不需要 |
| MCP 工具 | `gitnexus_query`、`gitnexus_context`、`gitnexus_impact` 等 | 需要 |

MCP 不可用时，本流程会降级为 Grep 与 Read 读源码：精度略低，但不阻断任务。因此配置 MCP 是提升分析精度的手段，不是使用前置门槛。

## 前置条件

| # | 条件 | 检查方式 | 不满足时 |
| --- | --- | --- | --- |
| 1 | GitNexus 要求 Node.js 18 或更高；HELM 自身要求 Node.js 20.19 或更高 | `node -v` | 先安装 Node.js |
| 2 | npm 可用 | `npm -v` | 随 Node.js 自带 |
| 3 | 目标仓库已建索引 | 在仓库根执行 `npx gitnexus status` | 执行 `npx gitnexus analyze --index-only` |
| 4 | npm 能访问公网或镜像 | `npm ping` | 配置 npm 镜像或代理 |

第 4 条在受限网络里最容易卡住。若 `npm ping` 失败，先解决 npm 的网络可达性，再谈 MCP 配置。

## 配置步骤

### 1. 建立索引（若尚未建立）

在目标代码工程根目录执行：

```bash
npx gitnexus analyze --index-only
```

索引落在仓库根的 `.gitnexus/` 目录。不加 `--index-only` 时，`analyze` 会安装 agent skills、注册编辑器 hooks 并写出 `AGENTS.md` 与 `CLAUDE.md`，这些文件与本流程托管的文件重叠，因此统一只用索引能力。

### 2. 让 GitNexus 自动写入编辑器配置

```bash
npx gitnexus setup
```

`setup` 会探测本机已安装的编辑器，并把 MCP 条目写进它们的配置文件。它可以一次只处理指定编辑器，例如：

```bash
npx gitnexus setup -c cursor,codex
```

这一步会改动仓库之外的文件，属于用户自己的决定，本流程不代为执行。执行前请确认哪些编辑器需要接入，执行后再按第 4 步验证。

### 3. 手动配置（不想用自动写入时）

在对应配置文件里加入 `mcpServers` 条目：

```json
{
  "mcpServers": {
    "gitnexus": {
      "command": "npx",
      "args": ["-y", "gitnexus", "mcp"]
    }
  }
}
```

这里的传输方式是 stdio，由编辑器在需要时拉起进程，不需要额外端口。写入时若文件里已有 `mcpServers`，把 `gitnexus` 这一项合并进去，不要覆盖其他条目。

### 4. 配置文件位置

| 编辑器 | 配置文件 | 支持状态 |
| --- | --- | --- |
| Claude Code | 项目级 `<项目目录>/.mcp.json`；用户级用 `claude mcp add` 命令写入 | 已支持 |
| Cursor | `~/.cursor/mcp.json` | 已支持 |
| Codex | `~/.codex/config.toml`（项目级 `.codex/config.toml`） | 已支持 |
| OpenCode、VS Code Copilot、ZCode（`.agents`） | 由 `npx gitnexus setup` 探测后写入 | 已支持 |
| CodeBuddy | `~/.codebuddy/.mcp.json` | 本仓库暂未支持（planned），格式仅供参照 |

本表记录的是各编辑器自身的全局配置文件位置，不是本流程的安装落点，属于路径写死禁令的例外；本流程安装到宿主时落点仍用 `<AGENT_DIR>` 表示。具体路径以编辑器官方文档为准。

第 3 步的 JSON 片段适用于使用 JSON 配置的编辑器。Codex 的配置文件是 TOML 格式（`~/.codex/config.toml`），直接在 TOML 里手写容易写错段落，建议对 Codex 直接执行 `npx gitnexus setup -c codex`，由它写入。

### 5. 重启编辑器

MCP 服务在编辑器启动时加载，配置改动后必须重启才能生效。重启后用第 6 步验证。

### 6. 验证

| 验证方式 | 预期结果 |
| --- | --- |
| 读取 `gitnexus://repos` 资源 | 返回已索引仓库列表 |
| 调用 `gitnexus_list_repos` 工具 | 返回仓库名与路径 |
| 读取 `gitnexus://repo/<仓库名>/context` | 返回符号数、流程数等统计 |

三条中任意一条成功，就说明 MCP 已生效。

## 故障排查

| 问题 | 原因 | 处理 |
| --- | --- | --- |
| `gitnexus_list_repos` 工具不存在 | MCP 服务未加载 | 检查配置文件路径与 JSON 结构，重启编辑器 |
| 工具存在但返回空 | 仓库未建索引 | 在目标仓库执行 `npx gitnexus analyze --index-only` |
| 服务启动时报 npm 包下载失败或 E404 | 网络不可达或包名写错 | 手动执行 `npx -y gitnexus mcp` 观察报错；确认写的是 `gitnexus` 而不是其他包名 |
| `npx gitnexus` 命令不存在 | Node.js 未安装或版本过低 | 安装 Node.js 18 或更高版本（HELM 自身需要 20.19 或更高） |
| 建完索引后仍提示索引过期 | 服务缓存了旧状态 | 重启编辑器重新加载 |
| npm 无法访问外网 | 网络限制 | 配置 npm 镜像或代理后再执行第 2 步 |

## 使用前的可用性探测

在使用任何 GitNexus MCP 工具之前，先做一次轻量探测：

1. 尝试读取 `gitnexus://repos` 或调用 `gitnexus_list_repos`。
2. 成功则走 MCP 路径，使用 `gitnexus_query`、`gitnexus_context`、`gitnexus_impact` 等工具。
3. 失败则不阻断任务，降级为 Grep 与 Read 读源码，并在结论里说明本次结论来自静态阅读而非图谱查询。

用户不需要手动指定走哪条路径，探测结果决定即可。若用户希望得到更精确的分析，再引导其按本指南完成配置。
