# <领域名> 领域数据模型

> 模板用法：复制到目标仓 `docs/db/<领域>/<业务>.md`，替换尖括号内容，不要增删表格列。
> 真源：`references/db-design-convention.md`（T 组管表格，B 组管通用字段，Q 组管建表语句，E 组管实体骨架）。
> 通用字段（id / created_by / updated_by / created_at / updated_at / version / deleted）不写进字段表。

## <业务名>

表名: `<table_name>`

| 字段 | 字段含义 | mysql中的数据类型 | 是否为非空 | 枚举值 | 关联的表 | 默认值 |
| --- | --- | --- | --- | --- | --- | --- |
| <column_name> | <业务语义，允许为空时写清空值语义> | <varchar(64)> | <Y 或留空> | <CODE 含义,> | <关联表名，无则留空> | <DDL 原文，无则留空> |

### 索引

- `<UNIQUE KEY uk_xxx (xxx)>`，<用途>
- `<KEY idx_xxx (xxx, xxx)>`，<用途>

### 变更记录

| 日期 | 变更 | 说明 |
| --- | --- | --- |
| <YYYY-MM-DD> | 新建 | <首版，对应迁移脚本 V...> |

## 枚举快照（可选，跨表复用的枚举才写）

一个取值一行，不合并成一行用 `/` 分隔：

| 枚举名 | 取值 | 含义 | 承载类型 |
| --- | --- | --- | --- |
| `<OrderStatusEnum>` | `WAIT_PAY` | 待支付 | `varchar(32)` |
| `<OrderStatusEnum>` | `PAID` | 已支付 | `varchar(32)` |
