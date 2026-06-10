<script setup lang="ts">
import { ref, computed } from "vue";
import { useI18n } from "vue-i18n";
import { diffLines } from "diff";
import { Button } from "@/components/ui/button";
import { copyToClipboard } from "@/lib/clipboard";
import { useToast } from "@/composables/useToast";
import { useSettingsStore } from "@/stores/settingsStore";
import { DEFAULT_CUSTOM_THEME_DDL_COLORS } from "@/stores/settingsStore";
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
const sourceDdlRef = ref<HTMLDivElement>();
const targetDdlRef = ref<HTMLDivElement>();
const isSyncingScroll = ref(false);

function syncScroll(from: "source" | "target") {
  if (isSyncingScroll.value) return;
  isSyncingScroll.value = true;
  const source = sourceDdlRef.value;
  const target = targetDdlRef.value;
  if (source && target) {
    if (from === "source") {
      target.scrollTop = source.scrollTop;
    } else {
      source.scrollTop = target.scrollTop;
    }
  }
  isSyncingScroll.value = false;
}

// ---------- Diff viewer ----------

interface DiffRow {
  type: "equal" | "insert" | "delete" | "modify";
  leftLine: string;
  rightLine: string;
  leftLineNum: number | null;
  rightLineNum: number | null;
  charDiffs?: { source: string; target: string }[];
}

interface MergedPatch {
  type: "equal" | "insert" | "delete" | "modify";
  leftValue: string;
  rightValue: string;
}

function splitLines(value: string): string[] {
  const lines = value.split("\n");
  if (lines.length > 0 && lines[lines.length - 1] === "") lines.pop();
  return lines;
}

function levenshteinDistance(a: string, b: string): number {
  const matrix: number[][] = [];
  for (let i = 0; i <= b.length; i++) matrix[i] = [i];
  for (let j = 0; j <= a.length; j++) matrix[0][j] = j;
  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      matrix[i][j] =
        b.charAt(i - 1) === a.charAt(j - 1)
          ? matrix[i - 1][j - 1]
          : Math.min(matrix[i - 1][j - 1] + 1, matrix[i][j - 1] + 1, matrix[i - 1][j] + 1);
    }
  }
  return matrix[b.length][a.length];
}

function computeSimilarity(a: string, b: string): number {
  if (a === b) return 1;
  const longer = a.length > b.length ? a : b;
  if (longer.length === 0) return 1;
  const distance = levenshteinDistance(a, b);
  return (longer.length - distance) / longer.length;
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

function mergePatches(patches: Array<{ value: string; added?: boolean; removed?: boolean }>): MergedPatch[] {
  const result: MergedPatch[] = [];
  for (let i = 0; i < patches.length; i++) {
    const curr = patches[i];
    const next = patches[i + 1];
    if (curr.removed && next?.added) {
      const similarity = computeSimilarity(curr.value, next.value);
      if (similarity > 0.3) {
        result.push({ type: "modify", leftValue: curr.value, rightValue: next.value });
        i++;
        continue;
      }
    }
    if (!curr.added && !curr.removed) {
      result.push({ type: "equal", leftValue: curr.value, rightValue: curr.value });
    } else if (curr.removed) {
      result.push({ type: "delete", leftValue: curr.value, rightValue: "" });
    } else if (curr.added) {
      result.push({ type: "insert", leftValue: "", rightValue: curr.value });
    }
  }
  return result;
}

function computeDiffRows(sourceDdl: string, targetDdl: string): DiffRow[] {
  const patches = diffLines(sourceDdl, targetDdl, { newlineIsToken: false });
  const merged = mergePatches(patches);
  const rows: DiffRow[] = [];
  let leftLineNum = 1;
  let rightLineNum = 1;

  for (const patch of merged) {
    if (patch.type === "equal") {
      for (const line of splitLines(patch.leftValue)) {
        rows.push({
          type: "equal",
          leftLine: line,
          rightLine: line,
          leftLineNum: leftLineNum++,
          rightLineNum: rightLineNum++,
        });
      }
    } else if (patch.type === "delete") {
      for (const line of splitLines(patch.leftValue)) {
        rows.push({
          type: "delete",
          leftLine: line,
          rightLine: "",
          leftLineNum: leftLineNum++,
          rightLineNum: null,
        });
      }
    } else if (patch.type === "insert") {
      for (const line of splitLines(patch.rightValue)) {
        rows.push({
          type: "insert",
          leftLine: "",
          rightLine: line,
          leftLineNum: null,
          rightLineNum: rightLineNum++,
        });
      }
    } else if (patch.type === "modify") {
      const leftLines = splitLines(patch.leftValue);
      const rightLines = splitLines(patch.rightValue);
      const maxLines = Math.max(leftLines.length, rightLines.length);
      for (let i = 0; i < maxLines; i++) {
        const leftLine = leftLines[i] || "";
        const rightLine = rightLines[i] || "";
        rows.push({
          type: "modify",
          leftLine,
          rightLine,
          leftLineNum: leftLine ? leftLineNum++ : null,
          rightLineNum: rightLine ? rightLineNum++ : null,
          charDiffs: computeCharDiffs(leftLine, rightLine),
        });
      }
    }
  }

  return rows;
}

const diffRows = computed(() => {
  if (!props.selectedObject?.sourceDdl && !props.selectedObject?.targetDdl) return [];
  return computeDiffRows(props.selectedObject?.sourceDdl || "", props.selectedObject?.targetDdl || "");
});

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
      <div v-else class="absolute inset-0 flex font-mono text-xs leading-relaxed">
        <!-- Source DDL -->
        <div ref="sourceDdlRef" class="flex-1 overflow-y-auto" @scroll="syncScroll('source')">
          <div class="sticky top-0 bg-muted/50 px-3 py-1.5 text-xs font-medium border-b z-10">
            {{ t("diff.sourceDdl") }}
          </div>
          <div
            v-for="(row, idx) in diffRows"
            :key="`src-${idx}`"
            class="flex"
            :style="
              row.type === 'delete'
                ? { backgroundColor: toRgba(ddlColors.removedRowBg, ddlColors.removedRowBgAlpha) }
                : row.type === 'modify'
                  ? { backgroundColor: toRgba(ddlColors.modifiedRowBg, ddlColors.modifiedRowBgAlpha) }
                  : undefined
            "
          >
            <span class="text-muted-foreground w-8 text-right pr-2 select-none shrink-0">
              {{ row.leftLineNum ?? "" }}
            </span>
            <span class="flex-1 px-1 whitespace-pre">
              <template v-if="row.type === 'modify' && row.charDiffs">
                <span
                  v-for="(cd, ci) in row.charDiffs"
                  :key="ci"
                  :style="
                    cd.source !== cd.target
                      ? { backgroundColor: toRgba(ddlColors.modifiedCharBg, ddlColors.modifiedCharBgAlpha) }
                      : undefined
                  "
                  >{{ cd.source }}</span
                >
              </template>
              <span v-else>{{ row.leftLine || "\u00A0" }}</span>
            </span>
          </div>
        </div>

        <!-- Target DDL -->
        <div ref="targetDdlRef" class="flex-1 overflow-y-auto" @scroll="syncScroll('target')">
          <div class="sticky top-0 bg-muted/50 px-3 py-1.5 text-xs font-medium border-b z-10">
            {{ t("diff.targetDdl") }}
          </div>
          <div
            v-for="(row, idx) in diffRows"
            :key="`tgt-${idx}`"
            class="flex"
            :style="
              row.type === 'insert'
                ? { backgroundColor: toRgba(ddlColors.addedRowBg, ddlColors.addedRowBgAlpha) }
                : row.type === 'modify'
                  ? { backgroundColor: toRgba(ddlColors.modifiedRowBg, ddlColors.modifiedRowBgAlpha) }
                  : undefined
            "
          >
            <span class="text-muted-foreground w-8 text-right pr-2 select-none shrink-0">
              {{ row.rightLineNum ?? "" }}
            </span>
            <span class="flex-1 px-1 whitespace-pre">
              <template v-if="row.type === 'modify' && row.charDiffs">
                <span
                  v-for="(cd, ci) in row.charDiffs"
                  :key="ci"
                  :style="
                    cd.source !== cd.target
                      ? { backgroundColor: toRgba(ddlColors.modifiedCharBg, ddlColors.modifiedCharBgAlpha) }
                      : undefined
                  "
                  >{{ cd.target }}</span
                >
              </template>
              <span v-else>{{ row.rightLine || "\u00A0" }}</span>
            </span>
          </div>
        </div>
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
