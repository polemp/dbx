<script setup lang="ts">
import { ref, watch, computed } from "vue";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { CustomTheme, CustomThemeColors } from "@/stores/settingsStore";
import { DEFAULT_CUSTOM_THEME_COLORS } from "@/stores/settingsStore";
import { Plus, Trash2, Copy, Pencil, ChevronDown } from "@lucide/vue";

interface Props {
  open: boolean;
  themes: CustomTheme[];
  activeThemeId: string;
}

const props = defineProps<Props>();
const emit = defineEmits<{
  (e: "update:open", value: boolean): void;
  (e: "save", themes: CustomTheme[], activeId: string): void;
}>();

const localThemes = ref<CustomTheme[]>([]);
const activeEditId = ref("");
const jsonText = ref("");
const renamingId = ref<string | null>(null);
const renamingName = ref("");

watch(
  () => props.open,
  (isOpen) => {
    if (isOpen) {
      localThemes.value = JSON.parse(JSON.stringify(props.themes));
      activeEditId.value = props.activeThemeId;
      syncJson();
    }
  },
);

function syncJson() {
  const theme = localThemes.value.find((t) => t.id === activeEditId.value);
  jsonText.value = JSON.stringify(theme?.colors ?? DEFAULT_CUSTOM_THEME_COLORS, null, 2);
}

watch(activeEditId, syncJson);

const activeTheme = computed(() => localThemes.value.find((t) => t.id === activeEditId.value));

const localColors = computed({
  get: () => activeTheme.value?.colors ?? { ...DEFAULT_CUSTOM_THEME_COLORS },
  set: (colors: CustomThemeColors) => {
    const theme = localThemes.value.find((t) => t.id === activeEditId.value);
    if (theme) theme.colors = { ...colors };
  },
});

watch(
  localThemes,
  () => {
    syncJson();
  },
  { deep: true },
);

const colorItems = [
  { key: "keyword" as const, label: "关键字", example: "SELECT, WHERE, IF", num: "①" },
  { key: "field" as const, label: "字段/变量", example: "id, name, _var", num: "②" },
  { key: "function" as const, label: "函数", example: "count, upper", num: "③" },
  { key: "string" as const, label: "字符串", example: "'hello', 'world'", num: "④" },
  { key: "number" as const, label: "数字", example: "100, 3.14", num: "⑤" },
  { key: "comment" as const, label: "注释", example: "--, /* */", num: "⑥" },
  { key: "table" as const, label: "表名", example: "users, orders", num: "⑦" },
  { key: "operator" as const, label: "运算符", example: "=, >, <>", num: "⑧" },
  { key: "type" as const, label: "类型", example: "INTEGER, TEXT", num: "⑨" },
  { key: "builtin" as const, label: "内置变量", example: "FOUND, SQLERRM", num: "⑩" },
];

// 基本调色板颜色（类似 Windows 颜色选择器）
const basicColors = [
  ["#000000", "#7f7f7f", "#880015", "#ed1c24", "#ff7f27", "#fff200", "#22b14c", "#00a2e8"],
  ["#3f48cc", "#a349a4", "#ffffff", "#c3c3c3", "#b97a57", "#ffaec9", "#ffc90e", "#efe4b0"],
];

const expandedPalette = ref<string | null>(null);

function togglePalette(key: string) {
  expandedPalette.value = expandedPalette.value === key ? null : key;
}

function applyBasicColor(key: keyof CustomThemeColors, color: string) {
  handleColorChange(key, color);
  expandedPalette.value = null;
}

const previewCode = computed(() => {
  const c = localColors.value;
  return [
    { text: "SELECT ", color: c.keyword, num: "①" },
    { text: "id", color: c.field, num: "②" },
    { text: ", ", color: c.operator, num: "⑧" },
    { text: "count", color: c.function, num: "③" },
    { text: "(*) ", color: c.operator, num: "⑧" },
    { text: "FROM ", color: c.keyword, num: "①" },
    { text: "users", color: c.table, num: "⑦" },
    { text: " ", color: "", num: "" },
    { text: "WHERE ", color: c.keyword, num: "①" },
    { text: "status", color: c.field, num: "②" },
    { text: " = ", color: c.operator, num: "⑧" },
    { text: "'active'", color: c.string, num: "④" },
    { text: " ", color: "", num: "" },
    { text: "AND ", color: c.keyword, num: "①" },
    { text: "id", color: c.field, num: "②" },
    { text: " > ", color: c.operator, num: "⑧" },
    { text: "100", color: c.number, num: "⑤" },
    { text: ";", color: c.operator, num: "⑧" },
  ];
});

function handleColorChange(key: keyof CustomThemeColors, value: string) {
  const theme = localThemes.value.find((t) => t.id === activeEditId.value);
  if (theme) {
    theme.colors = { ...theme.colors, [key]: value };
  }
}

function handleJsonChange() {
  try {
    const parsed = JSON.parse(jsonText.value);
    const theme = localThemes.value.find((t) => t.id === activeEditId.value);
    if (theme) {
      theme.colors = { ...DEFAULT_CUSTOM_THEME_COLORS, ...parsed };
    }
  } catch {
    // Invalid JSON, ignore
  }
}

function handleSave() {
  emit(
    "save",
    localThemes.value.map((t) => ({ ...t })),
    activeEditId.value,
  );
  emit("update:open", false);
}

function handleAddTheme() {
  const id = `custom-${Date.now()}`;
  const name = `主题 ${localThemes.value.length + 1}`;
  localThemes.value.push({
    id,
    name,
    colors: { ...DEFAULT_CUSTOM_THEME_COLORS },
  });
  activeEditId.value = id;
}

function handleDeleteTheme(id: string) {
  if (localThemes.value.length <= 1) {
    alert("至少保留一个主题");
    return;
  }
  localThemes.value = localThemes.value.filter((t) => t.id !== id);
  if (activeEditId.value === id) {
    activeEditId.value = localThemes.value[0]?.id ?? "";
  }
}

function handleDuplicateTheme(theme: CustomTheme) {
  const id = `custom-${Date.now()}`;
  localThemes.value.push({
    id,
    name: `${theme.name} 副本`,
    colors: { ...theme.colors },
  });
  activeEditId.value = id;
}

function startRename(theme: CustomTheme) {
  renamingId.value = theme.id;
  renamingName.value = theme.name;
}

function confirmRename() {
  if (!renamingId.value) return;
  const theme = localThemes.value.find((t) => t.id === renamingId.value);
  if (theme && renamingName.value.trim()) {
    theme.name = renamingName.value.trim();
  }
  renamingId.value = null;
  renamingName.value = "";
}

function cancelRename() {
  renamingId.value = null;
  renamingName.value = "";
}

function handleExport() {
  const theme = localThemes.value.find((t) => t.id === activeEditId.value);
  if (!theme) return;
  const blob = new Blob([JSON.stringify(theme.colors, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `dbx-theme-${theme.name}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

function handleImport() {
  try {
    const parsed = JSON.parse(jsonText.value);
    const theme = localThemes.value.find((t) => t.id === activeEditId.value);
    if (theme) {
      theme.colors = { ...DEFAULT_CUSTOM_THEME_COLORS, ...parsed };
    }
  } catch (e) {
    alert("JSON格式错误，请检查");
  }
}
</script>

<template>
  <Dialog :open="open" @update:open="emit('update:open', $event)">
    <DialogContent class="sm:max-w-[860px] max-h-[90vh] overflow-hidden flex flex-col" @click="expandedPalette = null">
      <DialogHeader>
        <DialogTitle>自定义主题配置</DialogTitle>
      </DialogHeader>

      <div class="flex-1 min-h-0 flex gap-4">
        <!-- 主题列表侧边栏 -->
        <div class="w-48 shrink-0 flex flex-col gap-2">
          <div class="text-sm font-medium px-1">我的主题</div>
          <div class="flex-1 overflow-y-auto space-y-1 pr-1">
            <div
              v-for="theme in localThemes"
              :key="theme.id"
              class="group flex items-center gap-2 rounded-md px-2 py-1.5 cursor-pointer text-sm"
              :class="activeEditId === theme.id ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'"
              @click="activeEditId = theme.id"
            >
              <div class="flex-1 min-w-0">
                <div v-if="renamingId === theme.id" class="flex items-center gap-1" @click.stop>
                  <Input
                    v-model="renamingName"
                    class="h-6 text-xs px-1 py-0"
                    @keydown.enter="confirmRename"
                    @keydown.esc="cancelRename"
                    @blur="confirmRename"
                    autofocus
                  />
                </div>
                <div v-else class="truncate">{{ theme.name }}</div>
              </div>
              <div class="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                <Button variant="ghost" size="icon" class="h-5 w-5" @click.stop="startRename(theme)">
                  <Pencil class="h-3 w-3" />
                </Button>
                <Button variant="ghost" size="icon" class="h-5 w-5" @click.stop="handleDuplicateTheme(theme)">
                  <Copy class="h-3 w-3" />
                </Button>
                <Button variant="ghost" size="icon" class="h-5 w-5" @click.stop="handleDeleteTheme(theme.id)">
                  <Trash2 class="h-3 w-3" />
                </Button>
              </div>
            </div>
          </div>
          <Button variant="outline" size="sm" class="w-full gap-1" @click="handleAddTheme">
            <Plus class="h-4 w-4" />
            新建主题
          </Button>
        </div>

        <!-- 编辑区域 -->
        <div class="flex-1 min-w-0 overflow-hidden flex flex-col">
          <Tabs defaultValue="visual" class="w-full flex-1 flex flex-col">
            <TabsList class="grid w-full grid-cols-2">
              <TabsTrigger value="visual">可视化编辑</TabsTrigger>
              <TabsTrigger value="json">JSON配置</TabsTrigger>
            </TabsList>

            <TabsContent value="visual" class="space-y-4 flex-1 overflow-y-auto pr-1">
              <!-- 预览区域 -->
              <div class="rounded-lg border bg-black/50 p-5 font-mono text-base">
                <div class="mb-2 text-sm text-muted-foreground">实时预览</div>
                <div class="leading-relaxed text-lg">
                  <span v-for="(token, i) in previewCode" :key="i" :style="{ color: token.color }" class="inline">
                    {{ token.text }}<sup v-if="token.num" class="text-sm opacity-60">{{ token.num }}</sup>
                  </span>
                </div>
                <div class="mt-2 text-sm" :style="{ color: localColors.comment }">
                  <sup class="text-sm">⑥</sup> -- 查询示例
                </div>
              </div>

              <!-- 颜色配置列表 -->
              <div class="grid grid-cols-2 gap-3">
                <div
                  v-for="item in colorItems"
                  :key="item.key"
                  class="relative flex items-center gap-3 rounded-lg border p-3"
                >
                  <span class="text-xl font-bold w-8 text-center shrink-0">{{ item.num }}</span>
                  <div class="flex-1 min-w-0">
                    <div class="font-medium text-sm">{{ item.label }}</div>
                    <div class="text-xs text-muted-foreground truncate">{{ item.example }}</div>
                  </div>
                  <div class="flex items-center gap-2 shrink-0">
                    <!-- 颜色方块 + 下拉箭头 -->
                    <div class="relative">
                      <button
                        type="button"
                        class="flex items-center gap-0.5 rounded border p-0.5 hover:bg-muted transition-colors"
                        @click="togglePalette(item.key)"
                      >
                        <div class="h-6 w-6 rounded-sm" :style="{ backgroundColor: localColors[item.key] }" />
                        <ChevronDown class="h-3 w-3 text-muted-foreground" />
                      </button>
                      <!-- 调色板弹出层 -->
                      <div
                        v-if="expandedPalette === item.key"
                        class="absolute right-0 top-full z-50 mt-1 rounded-lg border bg-popover p-2 shadow-lg"
                        @click.stop
                      >
                        <div class="space-y-1">
                          <div v-for="(row, rowIndex) in basicColors" :key="rowIndex" class="flex gap-1">
                            <button
                              v-for="color in row"
                              :key="color"
                              type="button"
                              class="h-5 w-5 rounded-sm border border-border/50 hover:scale-110 transition-transform"
                              :style="{ backgroundColor: color }"
                              @click="applyBasicColor(item.key, color)"
                            />
                          </div>
                        </div>
                        <div class="mt-2 pt-2 border-t flex items-center gap-2">
                          <input
                            type="color"
                            :value="localColors[item.key]"
                            @input="handleColorChange(item.key, ($event.target as HTMLInputElement).value)"
                            class="h-6 w-6 cursor-pointer rounded border-0 p-0"
                          />
                          <input
                            type="text"
                            :value="localColors[item.key]"
                            @input="handleColorChange(item.key, ($event.target as HTMLInputElement).value)"
                            class="w-20 rounded border px-2 py-0.5 text-xs font-mono"
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </TabsContent>

            <TabsContent value="json" class="space-y-4 flex-1 flex flex-col">
              <textarea
                v-model="jsonText"
                @blur="handleJsonChange"
                class="flex-1 w-full rounded-lg border bg-black/50 p-4 font-mono text-sm"
                spellcheck="false"
              />
              <div class="flex gap-2">
                <Button variant="outline" size="sm" @click="handleImport">粘贴导入</Button>
                <Button variant="outline" size="sm" @click="handleExport">导出JSON</Button>
              </div>
            </TabsContent>
          </Tabs>
        </div>
      </div>

      <DialogFooter class="gap-2">
        <Button variant="outline" @click="emit('update:open', false)">取消</Button>
        <Button @click="handleSave">保存并应用</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
