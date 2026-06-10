# PR #788 - 自定义主题系统与 PostgreSQL PL/pgSQL 语法高亮修复

## AI 代码声明
本 PR 包含由 AI（Claude Code）生成的代码。

## 概述
本 PR 引入了完整的自定义编辑器主题系统，并修复了 PostgreSQL 函数体内 PL/pgSQL 语法高亮失效的问题。

## 修改内容

### 1. PostgreSQL PL/pgSQL 语法高亮修复
**现象**：手动打开 PostgreSQL 函数页面时，`$function$...$function$` 块内的代码完全失去语法高亮（显示为纯黑色文本）。

**根因**：`@codemirror/lang-sql` 的 PostgreSQL 方言默认开启 `doubleDollarQuotedStrings: true`，导致解析器将 `$tag$...$tag$` 内的所有内容识别为字符串字面量，无法解析 SQL/PL/pgSQL 关键字。

**修复**：在扩展的 PostgreSQL 方言定义中设置 `doubleDollarQuotedStrings: false`。

**效果**：函数体内的代码被正确解析为 SQL/PL/pgSQL，关键字（`declare`, `begin`, `if`, `PERFORM`）、类型（`integer`, `json`, `text`）和内置变量（`SQLERRM`, `TG_NAME`）均获得正确的高亮。

### 2. 自定义编辑器主题系统
**新增功能**：
- 多主题管理（创建、重命名、复制、删除）
- 可视化颜色编辑器，支持 12 种语法元素颜色配置
- 12 套预设配色方案（从流行的 VS Code 主题中提取，包括 Custom、One Dark、VS Code Dark+ 等）
- JSON 配置导入/导出
- 带圈号映射的实时预览
- 背景色和前景色自定义
- 主题自动跟随系统暗色/亮色模式

**新增文件**：
- `apps/desktop/src/components/editor/ThemeCustomizerDialog.vue`（387 行）- 完整的主题编辑器对话框

**修改文件**：
- `apps/desktop/src/stores/settingsStore.ts` - 多主题数据结构，支持配置迁移
- `apps/desktop/src/lib/editorThemes.ts` - 自定义主题创建，支持系统主题默认值
- `apps/desktop/src/components/editor/EditorSettingsDialog.vue` - 合并预设主题和自定义主题下拉框，优化布局
- `apps/desktop/src/components/editor/QueryEditor.vue` - 支持自定义颜色的主题加载
- `apps/desktop/src/i18n/locales/en.ts` - 新增 26 个翻译键
- `apps/desktop/src/i18n/locales/zh-CN.ts` - 新增 26 个翻译键
- `apps/desktop/src/i18n/locales/zh-TW.ts` - 新增 26 个翻译键
- `apps/desktop/src/i18n/locales/es.ts` - 新增 26 个翻译键

### 3. UI 布局优化
- 重构 `EditorSettingsDialog.vue` 为两列网格（`[1fr_auto]`）
- 字体选择器占据可用空间；主题下拉框与自定义主题按钮组合
- 主题下拉框使用内容自适应宽度（`min-w-[80px] max-w-[200px]`）

### 4. 构建修复
- `src-tauri/Cargo.toml`：添加 `custom-protocol` feature，修复生产构建

## 文件变更
- 15 个文件变更，1191 行新增，44 行删除
- 1 个新增文件：`ThemeCustomizerDialog.vue`

## 测试验证
- [x] PostgreSQL 函数高亮在自动恢复和手动打开的页面均正常
- [x] 自定义主题的增删改查操作正常
- [x] 调色板和 JSON 导入/导出功能正常
- [x] 实时预览正确更新
- [x] 四种语言的国际化正常（en, zh-CN, zh-TW, es）
- [x] Tauri Release 构建正常加载

## 注意事项
- `.cargo/config.toml` 已保存为 UTF-8 纯文本格式（非 UTF-16 LE）
- 已从 PR 中排除：`docs/fix-pgsql-highlighting.md`、`CHANGELOG-v0.5.29.md`
