# 数据库架构比较功能增强与主题设置优化

## 概述

本次 PR 对 DBX 的数据库架构比较（Schema Diff）功能进行了大规模重构和功能增强，同时修复了主题设置中的预览布局问题。

主要改进包括：
1. **DDL 对比面板重构**：使用 `diffLines` 算法替换手写的 diff 逻辑
2. **部署审核步骤**：新增完整的部署工作流（审核 → 确认 → 执行 → 结果）
3. **配置步骤 UX 优化**：字段显示逻辑优化、服务器版本自动获取
4. **对象树改进**：图标标记、操作排序
5. **主题设置修复**：DDL 预览布局修正

---

## 主要变更

### 1. DDL 对比面板重构 (`SchemaDiffDdlPanel.vue`)

**问题**：旧的 `computeLineDiffs` 手写算法对复杂 DDL 的比对效果不佳，行对齐和差异标记经常出错。

**解决方案**：
- 引入 `diff` npm 包（`^9.0.0`）的 `diffLines` 函数，使用 Myers 算法进行行级差异计算
- 实现相邻 delete+insert 补丁的智能合并：当相似度 > 0.3 时合并为 `modify`（黄色高亮），否则保持独立的 delete（绿色）/ insert（红色）
- 新增字符级差异高亮：对 `modify` 行使用 Levenshtein 距离计算字符差异
- **Create 对象**：仅在左侧（源列）显示，绿色文字，右侧留空
- **Delete 对象**：仅在右侧（目标列）显示，红色删除线，左侧留空
- **Modify 对象**：左右两侧均显示，行级颜色标记 + 字符级差异
- 独立行号显示，滚动同步
- 动态主题颜色支持：从自定义主题读取 DDL 颜色配置

**技术细节**：
```typescript
diffLines(source, target, { newlineIsToken: false })
// 合并相邻的 removed + added 补丁为 modify
mergePatches(removed, added) // 当 computeSimilarity > 0.3
```

### 2. 部署审核步骤 (`SchemaDiffDeployStep.vue`)

**新增组件**：完整的部署审核工作流

**功能**：
- **左侧对象列表**：
  - 显示所有选中的顶层对象（排除列/索引/外键/触发器等子对象）
  - 每个对象显示两个图标：操作类型（创建/修改/删除）+ 对象类型（表/函数/视图等）
  - 按操作类型排序：创建 → 修改 → 删除
  - 点击对象 → CodeMirror 自动滚动到对应 SQL 位置
  
- **右侧 CodeMirror SQL 编辑器**：
  - 使用 CodeMirror 6，自定义 PostgreSQL dialect
  - 支持 PL/pgSQL 关键字高亮（`PERFORM`, `TG_NAME` 等）
  - 集成 `sql-formatter` 进行 SQL 格式化
  - 可编辑：用户可以在部署前手动修改 SQL
  - 自定义主题：根据应用主题自动切换编辑器主题

- **操作按钮**：
  - 复制脚本到剪贴板
  - 导出为 `.sql` 文件（文件名：`{database}_deploy_{timestamp}.sql`）
  - 部署到服务器

### 3. 部署确认与执行 (`SchemaDiffDialog.vue`)

**部署确认对话框**：
- 显示目标服务器信息：IP:端口、数据库版本、目标数据库（高亮）、目标 Schema（高亮）
- 显示操作统计：创建数 / 修改数 / 删除数
- 红色警告样式，防止误操作

**部署执行**：
- 使用 `executeScript`（非事务模式）执行 SQL
- 事务执行选项已移除：PostgreSQL DDL 语句（如 `CREATE INDEX CONCURRENTLY`）不支持事务

**部署结果对话框**：
- 成功：显示影响行数、执行的语句数
- 失败：显示详细错误信息
- 不自动返回：用户可以查看结果后手动返回

### 4. 配置步骤 UX 优化 (`SchemaDiffConfigStep.vue`)

**字段显示逻辑**：
- **连接**：始终显示
- **数据库**：始终显示（无选项时 disabled）
- **模式**：根据数据库类型动态显示（`isSchemaAware`）
  - PostgreSQL / SQL Server / Oracle 等 → 显示
  - MySQL / SQLite 等 → 隐藏

**服务器版本自动获取**：
- 选择数据库后自动查询服务器版本
- 支持 PostgreSQL (`SELECT version()`)、MySQL (`SELECT VERSION()`)、SQLite (`SELECT sqlite_version()`)
- 版本号显示在信息卡片中

### 5. 对象树改进 (`SchemaDiffObjectTree.vue`)

**图标标记**：
- 表：`Table`（琥珀色）
- 视图：`Eye`（青色）
- 函数：`FunctionSquare`（紫色）
- 序列：`ListOrdered`（橙色）
- 索引：`ListTree`（蓝绿色）
- 外键：`Link2`（黄绿色）
- 触发器：`Zap`（玫红色）

### 6. 序列 DDL 生成 (`lib/schemaDiff.ts`)

**新增**：`buildSequenceDdl()` 函数
- 为 PostgreSQL 序列生成 `CREATE SEQUENCE` + `SELECT setval()` DDL
- 序列自动预填充 `sourceDdl` / `targetDdl`，参与 diff 比较

### 7. 主题设置修复 (`ThemeCustomizerDialog.vue`)

- 修复 DDL 预览中的 add/remove 示例位置互换问题
- 修复 create/delete 对象的显示侧逻辑

---

## 新增 i18n 键

| 键 | 中文 | 英文 |
|---|---|---|
| `diff.nextStepDeploy` | 下一步（审核部署） | Next (Review Deploy) |
| `diff.deployReview` | 部署审核 | Deploy Review |
| `diff.backToResult` | 返回结果 | Back to Result |
| `diff.copyScript` | 复制脚本 | Copy Script |
| `diff.exportSql` | 导出 .sql | Export .sql |
| `diff.deployToServer` | 部署到服务器 | Deploy to Server |
| `diff.deployConfirmTitle` | 最终确认 | Final Confirmation |
| `diff.deployConfirmMessage` | 您即将在目标数据库执行以下部署操作 | You are about to deploy... |
| `diff.targetServer` | 目标服务器 | Target Server |
| `diff.dbVersion` | 数据库版本 | Database Version |
| `diff.targetDatabase` | 目标数据库 | Target Database |
| `diff.targetSchema` | 目标 Schema | Target Schema |
| `diff.confirmDeploy` | 确认部署 | Confirm Deploy |
| `diff.exportSuccess` | 导出成功 | Export successful |
| `diff.create` | 创建 | Create |
| `diff.delete` | 删除 | Delete |
| `diff.modify` | 修改 | Modify |
| `diff.close` | 关闭 | Close |
| `diff.noObjectsSelected` | 请选择要部署的对象 | Please select objects to deploy |
| `diff.deploySuccess` | 部署成功 | Deploy Successful |
| `diff.deployFailed` | 部署失败 | Deploy Failed |
| `diff.deploySuccessMessage` | SQL 脚本已成功执行到目标数据库 | SQL script executed successfully... |
| `diff.deployFailedMessage` | 执行过程中发生错误 | An error occurred during execution |
| `diff.affectedRows` | 影响行数 | Affected Rows |
| `diff.executedStatements` | 执行语句数 | Executed Statements |
| `diff.serverVersion` | 服务器版本 | Server Version |

---

## 兼容性说明

### PostgreSQL
- ✅ 完整支持：表、视图、函数、序列、规则、所有者、索引、外键、触发器
- 函数重载通过 `(name, arguments)` 匹配（使用 `pg_get_function_arguments`）
- 序列使用 `pg_class` + `pg_sequence` 系统表（兼容权限限制）

### MySQL / SQLite
- ⚠️ 仅支持基础表级对象：表、视图、列、索引、外键、触发器
- 函数、序列、规则、所有者仅限 PostgreSQL

### 数据库版本获取
- PostgreSQL: `SELECT version()`
- MySQL: `SELECT VERSION()`
- SQLite: `SELECT sqlite_version()`

---

## 测试说明

### 前端构建
```bash
pnpm build
# ✓ built in ~2.5s
```

### Rust 构建
```bash
cargo build -p dbx
# Finished dev profile [unoptimized+debuginfo] in ~60s

cargo build --release -p dbx
# Finished release profile [optimized] in ~9m
```

### 测试场景
1. **配置步骤**：选择 PostgreSQL 连接 → 自动加载数据库列表 → 自动加载 Schema 列表 → 信息卡片显示服务器版本
2. **比较结果**：对象树正确显示操作类型图标和对象类型图标
3. **DDL 对比**：create 对象只在左侧显示（绿色），delete 只在右侧（红色删除线），modify 两侧显示（黄色 + 字符差异）
4. **部署审核**：选择对象 → 进入审核步骤 → 左侧列表按 创建→修改→删除 排序 → 点击对象 CodeMirror 滚动 → 可编辑 SQL → 导出/复制/部署
5. **部署确认**：显示服务器信息 + 操作统计 → 确认后执行 → 显示结果对话框

---

## 已知问题

1. **Git 对象损坏**：本地仓库存在损坏的 git object (`8d69904ea13a8c77a08165ad58910190878a7ba0`)，可能导致 `git fsck` 报错。建议执行 `git gc --prune=now` 或重新 clone 仓库。
2. **MySQL 支持**：MySQL 不支持函数、序列、规则、所有者的比较，后续可考虑扩展。

---

## 相关文件

- `apps/desktop/src/components/diff/SchemaDiffDdlPanel.vue`
- `apps/desktop/src/components/diff/SchemaDiffDeployStep.vue`
- `apps/desktop/src/components/diff/SchemaDiffDialog.vue`
- `apps/desktop/src/components/diff/SchemaDiffConfigStep.vue`
- `apps/desktop/src/components/diff/SchemaDiffObjectTree.vue`
- `apps/desktop/src/lib/schemaDiff.ts`
- `apps/desktop/src/i18n/locales/zh-CN.ts`
- `apps/desktop/src/i18n/locales/en.ts`
- `crates/dbx-core/src/schema_diff.rs`
- `crates/dbx-core/src/db/postgres.rs`
- `package.json`（新增 `diff ^9.0.0` 依赖）

---

## 合并信息

- **来源分支**：`feat/diff-lines`
- **目标分支**：`main`
- **合并方式**：Fast-forward
- **总提交数**：11 commits
- **影响文件**：10 files, +1016/-279 lines
