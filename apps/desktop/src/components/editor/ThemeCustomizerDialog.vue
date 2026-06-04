<script setup lang="ts">
import { ref, watch, computed } from "vue";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { CustomThemeColors } from "@/stores/settingsStore";
import { DEFAULT_CUSTOM_THEME_COLORS } from "@/stores/settingsStore";

interface Props {
  open: boolean;
  colors: CustomThemeColors;
}

const props = defineProps<Props>();
const emit = defineEmits<{
  (e: "update:open", value: boolean): void;
  (e: "save", colors: CustomThemeColors): void;
}>();

const localColors = ref<CustomThemeColors>({ ...props.colors });
const jsonText = ref("");

watch(
  () => props.open,
  (isOpen) => {
    if (isOpen) {
      localColors.value = { ...props.colors };
      jsonText.value = JSON.stringify(props.colors, null, 2);
    }
  },
);

watch(
  localColors,
  (newColors) => {
    jsonText.value = JSON.stringify(newColors, null, 2);
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
  localColors.value[key] = value;
}

function handleJsonChange() {
  try {
    const parsed = JSON.parse(jsonText.value);
    localColors.value = { ...DEFAULT_CUSTOM_THEME_COLORS, ...parsed };
  } catch {
    // Invalid JSON, ignore
  }
}

function handleSave() {
  emit("save", { ...localColors.value });
  emit("update:open", false);
}

function handleReset() {
  localColors.value = { ...DEFAULT_CUSTOM_THEME_COLORS };
}

function handleImport() {
  try {
    const parsed = JSON.parse(jsonText.value);
    localColors.value = { ...DEFAULT_CUSTOM_THEME_COLORS, ...parsed };
  } catch (e) {
    alert("JSON格式错误，请检查");
  }
}

function handleExport() {
  const blob = new Blob([JSON.stringify(localColors.value, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "dbx-custom-theme.json";
  a.click();
  URL.revokeObjectURL(url);
}
</script>

<template>
  <Dialog :open="open" @update:open="emit('update:open', $event)">
    <DialogContent class="max-w-2xl max-h-[90vh] overflow-y-auto">
      <DialogHeader>
        <DialogTitle>自定义主题配置</DialogTitle>
      </DialogHeader>

      <Tabs defaultValue="visual" class="w-full">
        <TabsList class="grid w-full grid-cols-2">
          <TabsTrigger value="visual">可视化编辑</TabsTrigger>
          <TabsTrigger value="json">JSON配置</TabsTrigger>
        </TabsList>

        <TabsContent value="visual" class="space-y-4">
          <!-- 预览区域 -->
          <div class="rounded-lg border bg-black/50 p-4 font-mono text-sm">
            <div class="mb-2 text-xs text-muted-foreground">实时预览</div>
            <div class="leading-relaxed">
              <span v-for="(token, i) in previewCode" :key="i" :style="{ color: token.color }" class="inline">
                {{ token.text }}<sup v-if="token.num" class="text-[10px] opacity-60">{{ token.num }}</sup>
              </span>
            </div>
            <div class="mt-2 text-xs" :style="{ color: localColors.comment }"><sup>⑥</sup> -- 查询示例</div>
          </div>

          <!-- 颜色配置列表 -->
          <div class="space-y-2">
            <div v-for="item in colorItems" :key="item.key" class="flex items-center gap-3 rounded-lg border p-3">
              <span class="text-lg font-bold w-8 text-center">{{ item.num }}</span>
              <div class="flex-1">
                <div class="font-medium">{{ item.label }}</div>
                <div class="text-xs text-muted-foreground">{{ item.example }}</div>
              </div>
              <div class="flex items-center gap-2">
                <input
                  type="color"
                  :value="localColors[item.key]"
                  @input="handleColorChange(item.key, ($event.target as HTMLInputElement).value)"
                  class="h-8 w-8 cursor-pointer rounded border-0 p-0"
                />
                <input
                  type="text"
                  :value="localColors[item.key]"
                  @input="handleColorChange(item.key, ($event.target as HTMLInputElement).value)"
                  class="w-20 rounded border px-2 py-1 text-xs font-mono"
                />
              </div>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="json" class="space-y-4">
          <textarea
            v-model="jsonText"
            @blur="handleJsonChange"
            class="h-64 w-full rounded-lg border bg-black/50 p-4 font-mono text-sm"
            spellcheck="false"
          />
          <div class="flex gap-2">
            <Button variant="outline" size="sm" @click="handleImport">粘贴导入</Button>
            <Button variant="outline" size="sm" @click="handleExport">导出JSON</Button>
            <Button variant="outline" size="sm" @click="handleReset">重置默认</Button>
          </div>
        </TabsContent>
      </Tabs>

      <DialogFooter class="gap-2">
        <Button variant="outline" @click="emit('update:open', false)">取消</Button>
        <Button @click="handleSave">保存并应用</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
