<script setup lang="ts">
import { ref, computed, watch, nextTick } from "vue";
import { useI18n } from "vue-i18n";
import { Button } from "@/components/ui/button";
import { copyToClipboard } from "@/lib/clipboard";
import { useToast } from "@/composables/useToast";
import { useSettingsStore } from "@/stores/settingsStore";
import { DEFAULT_CUSTOM_THEME_DDL_COLORS } from "@/stores/settingsStore";
import { useDiffScrollSync } from "@/composables/useDiffScrollSync";
import { buildHunks, type DiffLine } from "@/components/diff/DiffHunkBuilder";
import DiffSvgConnector from "@/components/diff/DiffSvgConnector.vue";
import { FileCode, ScrollText, Copy, Play } from "@lucide/vue";
import type { SchemaDiffObject } from "@/lib/schemaDiff";

const { t } = useI18n();
const { toast } = useToast();
const settingsStore = useSettingsStore();

const ddlColors = computed(() => {
  const themes = settingsStore.editorSettings.customThemes;
  const activeId = settingsStore.editorSettings.activeCustomThemeId;
  const activeTheme = themes.find((t) => t.id === activeId);
  return activeTheme?.ddlColors ?? DEFAULT_CUSTOM_THEME_DDL_COLORS;
});

function toRgba(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha / 100})`;
}

const props = defineProps<{
  selectedObject: SchemaDiffObject | null;
  deploySql: string;
  deploySqlAll: string;
}>();

const emit = defineEmits<{
  executeScript: [];
}>();

const activeTab = ref<"ddl" | "script" | "scriptAll">("ddl");
const diffContainerRef = ref<HTMLDivElement>();
const leftPaneRef = ref<HTMLDivElement>();
const rightPaneRef = ref<HTMLDivElement>();
const containerSize = ref({ width: 0, height: 0 });
const connectorKey = ref(0);

const hunks = computed(() => {
  if (!props.selectedObject?.sourceDdl && !props.selectedObject?.targetDdl) return [];
  return buildHunks(props.selectedObject?.sourceDdl || "", props.selectedObject?.targetDdl || "");
});

const { syncScroll, measureHunks } = useDiffScrollSync({
  container: diffContainerRef,
  leftPane: leftPaneRef,
  rightPane: rightPaneRef,
  hunks,
});

function measureAndRefresh() {
  measureHunks();
  connectorKey.value = connectorKey.value + 1;
}

watch(
  () => props.selectedObject?.id,
  async () => {
    await nextTick();
    updateContainerSize();
    measureAndRefresh();
  },
);

function updateContainerSize() {
  const el = diffContainerRef.value;
  if (!el) return;
  const rect = el.getBoundingClientRect();
  containerSize.value = { width: rect.width, height: rect.height };
}

function handleScroll(from: "left" | "right") {
  syncScroll(from);
  measureAndRefresh();
}

function lineBackground(line: DiffLine): string | undefined {
  if (line.isPadding) return undefined;
  if (line.type === "delete") {
    return toRgba(ddlColors.value.removedRowBg, ddlColors.value.removedRowBgAlpha);
  }
  if (line.type === "insert") {
    return toRgba(ddlColors.value.addedRowBg, ddlColors.value.addedRowBgAlpha);
  }
  if (line.type === "modify") {
    return toRgba(ddlColors.value.modifiedRowBg, ddlColors.value.modifiedRowBgAlpha);
  }
  return undefined;
}

function lineTextClass(line: DiffLine): string {
  if (line.isPadding) return "text-transparent";
  if (line.type === "delete") return "text-red-800 line-through";
  if (line.type === "insert") return "text-green-800";
  if (line.type === "modify") return "text-blue-800";
  return "";
}

function computeCharDiffs(source: string, target: string): { source: string; target: string }[] {
  const result: { source: string; target: string }[] = [];
  let sIdx = 0;
  let tIdx = 0;
  while (sIdx < source.length || tIdx < target.length) {
    if (sIdx >= source.length) {
      result.push({ source: "", target: target.substring(tIdx) });
      break;
    }
    if (tIdx >= target.length) {
      result.push({ source: source.substring(sIdx), target: "" });
      break;
    }
    if (source[sIdx] === target[tIdx]) {
      let matchLen = 0;
      while (
        sIdx + matchLen < source.length &&
        tIdx + matchLen < target.length &&
        source[sIdx + matchLen] === target[tIdx + matchLen]
      ) {
        matchLen++;
      }
      result.push({
        source: source.substring(sIdx, sIdx + matchLen),
        target: target.substring(tIdx, tIdx + matchLen),
      });
      sIdx += matchLen;
      tIdx += matchLen;
    } else {
      let sMatch = -1;
      let tMatch = -1;
      for (let i = 0; i < Math.min(10, source.length - sIdx, target.length - tIdx); i++) {
        if (source[sIdx + i] === target[tIdx]) {
          sMatch = i;
          tMatch = 0;
          break;
        }
        if (source[sIdx] === target[tIdx + i]) {
          sMatch = 0;
          tMatch = i;
          break;
        }
      }
      if (sMatch === -1) {
        sMatch = Math.min(1, source.length - sIdx);
        tMatch = Math.min(1, target.length - tIdx);
      }
      result.push({
        source: source.substring(sIdx, sIdx + (sMatch > 0 ? sMatch : 1)),
        target: target.substring(tIdx, tIdx + (tMatch > 0 ? tMatch : 1)),
      });
      sIdx += sMatch > 0 ? sMatch : 1;
      tIdx += tMatch > 0 ? tMatch : 1;
    }
  }
  return result;
}

function renderModifyLine(
  leftLine: DiffLine,
  rightLine: DiffLine,
): { leftSegments: Segment[]; rightSegments: Segment[] } {
  const charDiffs = computeCharDiffs(leftLine.content, rightLine.content);
  const leftSegments: Segment[] = [];
  const rightSegments: Segment[] = [];
  for (const cd of charDiffs) {
    if (cd.source === cd.target) {
      leftSegments.push({ text: cd.source, changed: false });
      rightSegments.push({ text: cd.target, changed: false });
    } else {
      if (cd.source) leftSegments.push({ text: cd.source, changed: true });
      if (cd.target) rightSegments.push({ text: cd.target, changed: true });
    }
  }
  return { leftSegments, rightSegments };
}

interface Segment {
  text: string;
  changed: boolean;
}

function copyDeploySql() {
  copyToClipboard(props.deploySql);
  toast(t("diff.copied"), 2000);
}

function copyDeploySqlAll() {
  copyToClipboard(props.deploySqlAll);
  toast(t("diff.copied"), 2000);
}
</script>

<template>
  <div class="border rounded-md flex flex-col h-full">
    <!-- Tabs -->
    <div class="flex border-b shrink-0">
      <button
        class="px-3 py-1.5 text-xs font-medium flex items-center gap-1 transition-colors"
        :class="activeTab === 'ddl' ? 'bg-primary/10 text-primary border-b-2 border-primary' : 'hover:bg-muted/50'"
        @click="activeTab = 'ddl'"
      >
        <FileCode class="w-3.5 h-3.5" />
        {{ t("diff.ddlCompare") }}
      </button>
      <button
        class="px-3 py-1.5 text-xs font-medium flex items-center gap-1 transition-colors"
        :class="activeTab === 'script' ? 'bg-primary/10 text-primary border-b-2 border-primary' : 'hover:bg-muted/50'"
        @click="activeTab = 'script'"
      >
        <ScrollText class="w-3.5 h-3.5" />
        {{ t("diff.deployScript") }}
      </button>
      <button
        class="px-3 py-1.5 text-xs font-medium flex items-center gap-1 transition-colors"
        :class="
          activeTab === 'scriptAll' ? 'bg-primary/10 text-primary border-b-2 border-primary' : 'hover:bg-muted/50'
        "
        @click="activeTab = 'scriptAll'"
      >
        <ScrollText class="w-3.5 h-3.5" />
        {{ t("diff.deployScriptAll") }}
      </button>
    </div>

    <!-- DDL Compare -->
    <div v-if="activeTab === 'ddl'" class="flex-1 overflow-hidden relative">
      <!-- 未选择对象 -->
      <div
        v-if="!selectedObject"
        class="absolute inset-0 flex items-center justify-center text-sm text-muted-foreground"
      >
        {{ t("diff.selectObjectToCompare") }}
      </div>
      <!-- 无DDL数据 -->
      <div
        v-else-if="!selectedObject.sourceDdl && !selectedObject.targetDdl"
        class="absolute inset-0 flex items-center justify-center text-sm text-muted-foreground"
      >
        {{ t("diff.noDdlAvailable") }}
      </div>
      <!-- Diff View -->
      <div v-else ref="diffContainerRef" class="absolute inset-0 flex font-mono text-xs leading-relaxed">
        <!-- Source DDL -->
        <div ref="leftPaneRef" class="w-1/2 overflow-y-auto border-r" @scroll="handleScroll('left')">
          <div class="sticky top-0 bg-muted/50 px-3 py-1.5 text-xs font-medium border-b z-10">
            {{ t("diff.sourceDdl") }}
          </div>
          <div v-for="hunk in hunks" :key="`left-${hunk.id}`" :data-hunk-id="hunk.id">
            <div
              v-for="(line, idx) in hunk.leftLines"
              :key="`l-${hunk.id}-${idx}`"
              class="flex min-h-[1.5em]"
              :style="{ backgroundColor: lineBackground(line) }"
            >
              <span class="text-muted-foreground w-8 text-right pr-2 select-none shrink-0">
                {{ line.lineNumber ?? "" }}
              </span>
              <span class="flex-1 px-1 whitespace-pre" :class="lineTextClass(line)">
                <template v-if="line.type === 'modify' && !line.isPadding">
                  <template
                    v-for="(segment, si) in renderModifyLine(line, hunk.rightLines[idx]).leftSegments"
                    :key="`ls-${si}`"
                  >
                    <span
                      :style="
                        segment.changed
                          ? { backgroundColor: toRgba(ddlColors.modifiedCharBg, ddlColors.modifiedCharBgAlpha) }
                          : undefined
                      "
                      >{{ segment.text }}</span
                    >
                  </template>
                </template>
                <span v-else>{{ line.isPadding ? "\u00A0" : line.content }}</span>
              </span>
            </div>
          </div>
        </div>

        <!-- Target DDL -->
        <div ref="rightPaneRef" class="w-1/2 overflow-y-auto" @scroll="handleScroll('right')">
          <div class="sticky top-0 bg-muted/50 px-3 py-1.5 text-xs font-medium border-b z-10">
            {{ t("diff.targetDdl") }}
          </div>
          <div v-for="hunk in hunks" :key="`right-${hunk.id}`" :data-hunk-id="hunk.id">
            <div
              v-for="(line, idx) in hunk.rightLines"
              :key="`r-${hunk.id}-${idx}`"
              class="flex min-h-[1.5em]"
              :style="{ backgroundColor: lineBackground(line) }"
            >
              <span class="text-muted-foreground w-8 text-right pr-2 select-none shrink-0">
                {{ line.lineNumber ?? "" }}
              </span>
              <span class="flex-1 px-1 whitespace-pre" :class="lineTextClass(line)">
                <template v-if="line.type === 'modify' && !line.isPadding">
                  <template
                    v-for="(segment, si) in renderModifyLine(hunk.leftLines[idx], line).rightSegments"
                    :key="`rs-${si}`"
                  >
                    <span
                      :style="
                        segment.changed
                          ? { backgroundColor: toRgba(ddlColors.modifiedCharBg, ddlColors.modifiedCharBgAlpha) }
                          : undefined
                      "
                      >{{ segment.text }}</span
                    >
                  </template>
                </template>
                <span v-else>{{ line.isPadding ? "\u00A0" : line.content }}</span>
              </span>
            </div>
          </div>
        </div>

        <!-- SVG Connector Overlay -->
        <DiffSvgConnector
          :key="connectorKey"
          :hunks="hunks"
          :container-width="containerSize.width"
          :container-height="containerSize.height"
        />
      </div>
    </div>

    <!-- Deploy Script -->
    <div v-else-if="activeTab === 'script'" class="flex-1 flex flex-col overflow-hidden">
      <div class="flex items-center justify-between px-3 py-1.5 border-b shrink-0">
        <span class="text-xs text-muted-foreground">{{ t("diff.deployScriptDesc") }}</span>
        <div class="flex gap-1">
          <Button variant="ghost" size="sm" class="h-6 px-2 text-xs gap-1" @click="copyDeploySql">
            <Copy class="w-3 h-3" />
            {{ t("diff.copy") }}
          </Button>
          <Button variant="ghost" size="sm" class="h-6 px-2 text-xs gap-1" @click="$emit('executeScript')">
            <Play class="w-3 h-3" />
            {{ t("diff.execute") }}
          </Button>
        </div>
      </div>
      <div class="flex-1 overflow-auto p-3">
        <pre class="text-xs whitespace-pre-wrap font-mono">{{ deploySql || t("diff.noDeployScript") }}</pre>
      </div>
    </div>

    <!-- Deploy Script All -->
    <div v-else-if="activeTab === 'scriptAll'" class="flex-1 flex flex-col overflow-hidden">
      <div class="flex items-center justify-between px-3 py-1.5 border-b shrink-0">
        <span class="text-xs text-muted-foreground">{{ t("diff.deployScriptAllDesc") }}</span>
        <div class="flex gap-1">
          <Button variant="ghost" size="sm" class="h-6 px-2 text-xs gap-1" @click="copyDeploySqlAll">
            <Copy class="w-3 h-3" />
            {{ t("diff.copy") }}
          </Button>
          <Button variant="ghost" size="sm" class="h-6 px-2 text-xs gap-1" @click="$emit('executeScript')">
            <Play class="w-3 h-3" />
            {{ t("diff.executeAll") }}
          </Button>
        </div>
      </div>
      <div class="flex-1 overflow-auto p-3">
        <pre class="text-xs whitespace-pre-wrap font-mono">{{ deploySqlAll || t("diff.noDeployScriptAll") }}</pre>
      </div>
    </div>
  </div>
</template>
