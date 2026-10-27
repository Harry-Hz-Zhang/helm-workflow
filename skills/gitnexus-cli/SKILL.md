---
name: gitnexus-cli
description: Load when the user needs GitNexus CLI commands to build an index, check index freshness, clean an index, generate a wiki, or list indexed repos. Triggers on "index this repo", "re-analyze the codebase", "generate a project wiki", and "the index is stale".
requires_skills: []
---

<!--
  Derived from abhigyanpatwari/GitNexus (.claude/skills/gitnexus-cli/SKILL.md).
  PolyForm Noncommercial License 1.0.0.
  Required Notice: Copyright Abhigyan Patwari (https://github.com/abhigyanpatwari/GitNexus)
  See THIRD-PARTY-NOTICES.md. Noncommercial use only. Do not remove this notice.
-->

# GitNexus 命令行

> 所有命令都通过 `npx` 运行，不需要全局安装。命令本身不依赖任何编辑器配置；需要把索引挂给编辑器里的 AI 助手时，见 `gitnexus-setup`。

## 命令总览

| 命令 | 作用 | 是否会写仓库文件 |
| --- | --- | --- |
| `analyze` | 解析源码、建立知识图谱、写入 `.gitnexus/` | 加 `--index-only` 后只写 `.gitnexus/` |
| `status` | 查看当前仓库的索引状态与新鲜度 | 否 |
| `clean` | 删除索引并从全局注册表摘除 | 删除 `.gitnexus/` |
| `wiki` | 基于图谱生成仓库文档 | 生成文档文件 |
| `list` | 列出已索引的仓库 | 否 |

## analyze：建立或刷新索引

在目标代码工程的根目录执行：

```bash
npx gitnexus analyze --index-only
```

`--index-only` 不是可选优化，而是本流程的标准写法。不加这个参数时，`analyze` 会额外安装 agent skills、注册编辑器 hooks，并写出 `AGENTS.md` 与 `CLAUDE.md`。这三类文件在本仓库中由流程自己托管，被外部改写后安装器清理时会留下孤儿文件，因此统一只用索引能力。

| 参数 | 作用 |
| --- | --- |
| `--index-only` | 只建索引，不写仓库集成文件 |
| `--force` | 即使索引已是最新也全量重建 |
| `--embeddings` | 生成向量嵌入以支持语义检索，默认关闭 |

首次索引耗时取决于仓库规模，几千文件的仓库通常在几分钟量级。

需要重新索引的时机有三个：第一次在某个工程里使用；代码发生大范围调整之后；读取 `gitnexus://repo/{name}/context` 时返回索引过期的提示。

## status：检查索引新鲜度

```bash
npx gitnexus status
```

输出当前仓库是否已建立索引、上次更新时间、符号与关系数量。判断是否需要重新索引时先跑这条，不要凭感觉重建。

## clean：删除索引

```bash
npx gitnexus clean
```

删除 `.gitnexus/` 目录，并把该仓库从全局注册表中摘除。索引损坏需要重建前，或者要把 GitNexus 从某个工程里彻底移除时使用。

| 参数 | 作用 |
| --- | --- |
| `--force` | 跳过确认提示 |
| `--all` | 清理所有已索引仓库，而不只是当前仓库 |

## wiki：从图谱生成文档

```bash
npx gitnexus wiki
```

借助大模型把知识图谱转成仓库文档。首次使用需要提供 API key，凭据保存在 `~/.gitnexus/config.json`。

| 参数 | 作用 |
| --- | --- |
| `--force` | 强制全量重新生成 |
| `--model <model>` | 指定大模型 |
| `--base-url <url>` | 指定模型服务的 API 地址 |
| `--api-key <key>` | 直接传入 API key |
| `--concurrency <n>` | 并行请求数，默认 3 |
| `--gist` | 把生成的 wiki 发布为公开 GitHub Gist |

## list：列出已索引仓库

```bash
npx gitnexus list
```

输出全局注册表 `~/.gitnexus/registry.json` 中登记的所有仓库。MCP 侧的 `gitnexus_list_repos` 工具给出同样的信息。

## 索引之后的下一步

1. 读取 `gitnexus://repo/{name}/context`，确认索引已加载且未过期。
2. 按任务类型选择后续技能：理解代码用 `gitnexus-exploring`，评估改动影响用 `gitnexus-impact-analysis`，定位报错用 `gitnexus-debugging`，查工具与图结构用 `gitnexus-guide`。

## 故障排查

| 现象 | 原因 | 处理 |
| --- | --- | --- |
| 提示不在 git 仓库内 | 当前目录不在任何 git 工作树中 | 切到仓库内的目录再执行 |
| 重新索引后编辑器仍报索引过期 | 编辑器里的 MCP 服务缓存了旧状态 | 重启编辑器，让服务重新加载 |
| 生成嵌入很慢 | 默认走本地推理 | 省略 `--embeddings`，或配置 `OPENAI_API_KEY` 走 API 加速 |
| 命令找不到 | Node.js 未安装或版本过低 | 安装 Node.js 18 或更高版本（HELM 自身需要 20.19 或更高） |
| 报未知参数 `--index-only` | 安装的 GitNexus 版本偏旧 | 升级到 1.6 以上的稳定版再重试 |
