<!-- 本文件由 helm-workflow-auto 使用；唯一真源；路径：<change>/helm-auto-memory.md -->
# HELM Auto Memory

> 进度追踪文件。每步完成后将对应行 `[ ]` 改为 `[x]`。
> 本文件是**格式唯一真源**；`skills/helm-workflow-auto/SKILL.md` 只引用不内联。
> 新增需求：在文件末尾追加新的 `## yyyy-MM-dd <需求功能点>` 小节，不改写历史小节。

## yyyy-MM-dd <需求功能点>

- [ ] explore 需求探索阶段，使用 brainstorming skill 进行思考
- [ ] propose 阶段，执行生成详细设计文档
- [ ] Build Gate：编译验证（exit code 0 方可进入 apply）
- [ ] apply 阶段，开始执行
- [ ] 单元测试
- [ ] 代码审查
- [ ] archive 归档（change 收尾）

## 写入规则

- 状态只有两种：`[ ]` 未完成、`[x]` 已完成；禁止用其它符号。
- 每行 MUST 以 `- [ ]` 或 `- [x]` 开头（便于机械统计进度）。
- Build Gate 行的 `[x]` 必须同时满足：构建 `exit code: 0` 且证据已写入 `log.md`。
