<script setup lang="ts">
import { ref, computed } from "vue";
import { useI18n } from "vue-i18n";
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

// Simple diff algorithm for DDL comparison
interface DiffLine {
  type: "same" | "added" | "removed" | "modified";
  sourceLine: string;
  targetLine: string;
  charDiffs?: { source: string; target: string }[];
}

function computeLineDiffs(sourceLines: string[], targetLines: string[]): DiffLine[] {
  const result: DiffLine[] = [];
  let sIdx = 0;
  let tIdx = 0;

  while (sIdx < sourceLines.length || tIdx < targetLines.length) {
    const sLine = sourceLines[sIdx] || "";
    const tLine = targetLines[tIdx] || "";

    if (sIdx >= sourceLines.length) {
      for (let i = tIdx; i < targetLines.length; i++) {
        result.push({ type: "added", sourceLine: "", targetLine: targetLines[i] });
      }
      break;
    }

    if (tIdx >= targetLines.length) {
      for (let i = sIdx; i < sourceLines.length; i++) {
        result.push({ type: "removed", sourceLine: sourceLines[i], targetLine: "" });
      }
      break;
    }

    if (sLine === tLine) {
      result.push({ type: "same", sourceLine: sLine, targetLine: tLine });
      sIdx++;
      tIdx++;
      continue;
    }

    const similarity = computeSimilarity(sLine, tLine);
    if (similarity > 0.5) {
      const charDiffs = computeCharDiffs(sLine, tLine);
      result.push({ type: "modified", sourceLine: sLine, targetLine: tLine, charDiffs });
      sIdx++;
      tIdx++;
      continue;
    }

    let foundMatch = false;
    for (let lookAhead = 1; lookAhead <= 3 && sIdx + lookAhead < sourceLines.length; lookAhead++) {
      if (sourceLines[sIdx + lookAhead] === tLine) {
        for (let i = 0; i < lookAhead; i++) {
          result.push({ type: "removed", sourceLine: sourceLines[sIdx + i], targetLine: "" });
        }
        sIdx += lookAhead;
        foundMatch = true;
        break;
      }
    }

    if (!foundMatch) {
      for (let lookAhead = 1; lookAhead <= 3 && tIdx + lookAhead < targetLines.length; lookAhead++) {
        if (targetLines[tIdx + lookAhead] === sLine) {
          for (let i = 0; i < lookAhead; i++) {
            result.push({ type: "added", sourceLine: "", targetLine: targetLines[tIdx + i] });
          }
          tIdx += lookAhead;
          foundMatch = true;
          break;
        }
      }
    }

    if (!foundMatch) {
      result.push({ type: "removed", sourceLine: sLine, targetLine: "" });
      result.push({ type: "added", sourceLine: "", targetLine: tLine });
      sIdx++;
      tIdx++;
    }
  }

  return result;
}

function computeSimilarity(a: string, b: string): number {
  if (a === b) return 1;
  const longer = a.length > b.length ? a : b;
  if (longer.length === 0) return 1;
  const distance = levenshteinDistance(a, b);
  return (longer.length - distance) / longer.length;
}

function levenshteinDistance(a: string, b: string): number {
  const matrix: number[][] = [];
  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= a.length; j++) {
    matrix[0][j] = j;
  }
  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(matrix[i - 1][j - 1] + 1, matrix[i][j - 1] + 1, matrix[i - 1][j] + 1);
      }
    }
  }
  return matrix[b.length][a.length];
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

const ddlMode = computed(() => props.selectedObject?.operationType || "none");

const sourceLines = computed(() => (props.selectedObject?.sourceDdl || "").split("\n"));
const targetLines = computed(() => (props.selectedObject?.targetDdl || "").split("\n"));

const ddlDiffs = computed(() => {
  if (!props.selectedObject?.sourceDdl && !props.selectedObject?.targetDdl) return [];
  return computeLineDiffs(sourceLines.value, targetLines.value);
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
        class="flex items-center gap-1.5 px-4 py-2 text-xs font-medium transition-colors"
        :class="
          activeTab === 'ddl'
            ? 'bg-primary/10 text-primary border-b-2 border-primary'
            : 'text-muted-foreground hover:text-foreground'
        "
        @click="activeTab = 'ddl'"
      >
        <FileCode class="w-3.5 h-3.5" />
        {{ t("diff.ddlCompare") }}
      </button>
      <button
        class="flex items-center gap-1.5 px-4 py-2 text-xs font-medium transition-colors"
        :class="
          activeTab === 'script'
            ? 'bg-primary/10 text-primary border-b-2 border-primary'
            : 'text-muted-foreground hover:text-foreground'
        "
        @click="activeTab = 'script'"
      >
        <ScrollText class="w-3.5 h-3.5" />
        {{ t("diff.deployScript") }}
      </button>
      <button
        class="flex items-center gap-1.5 px-4 py-2 text-xs font-medium transition-colors"
        :class="
          activeTab === 'scriptAll'
            ? 'bg-primary/10 text-primary border-b-2 border-primary'
            : 'text-muted-foreground hover:text-foreground'
        "
        @click="activeTab = 'scriptAll'"
      >
        <ScrollText class="w-3.5 h-3.5" />
        {{ t("diff.deployScriptAll") }}
      </button>
    </div>

    <!-- DDL Compare -->
    <div v-if="activeTab === 'ddl'" class="flex-1 overflow-hidden relative">
      <!-- No selection -->
      <div
        v-if="!selectedObject"
        class="absolute inset-0 flex items-center justify-center text-sm text-muted-foreground"
      >
        {{ t("diff.selectObjectToCompare") }}
      </div>

      <!-- No DDL available -->
      <div
        v-else-if="!selectedObject.sourceDdl && !selectedObject.targetDdl"
        class="absolute inset-0 flex items-center justify-center text-sm text-muted-foreground"
      >
        {{ t("diff.noDdlAvailable") }}
      </div>

      <!-- Create mode: source has it, target doesn't -->
      <div v-else-if="ddlMode === 'create'" class="absolute inset-0 flex">
        <div class="flex-1 overflow-y-auto">
          <div class="sticky top-0 bg-muted/50 px-3 py-1.5 text-xs font-medium border-b z-10">
            {{ t("diff.sourceDdl") }}
          </div>
          <div class="font-mono text-xs leading-relaxed">
            <div
              v-for="(line, idx) in sourceLines"
              :key="idx"
              class="px-3 py-0.5 min-h-[20px]"
              :style="{ backgroundColor: toRgba(ddlColors.removedRowBg, ddlColors.removedRowBgAlpha) }"
            >
              {{ line }}
            </div>
          </div>
        </div>
        <div class="flex-1 overflow-y-auto">
          <div class="sticky top-0 bg-muted/50 px-3 py-1.5 text-xs font-medium border-b z-10">
            {{ t("diff.targetDdl") }}
          </div>
          <div class="flex items-center justify-center h-full text-sm text-muted-foreground">
            {{ t("diff.objectNotExistsInTarget") }}
          </div>
        </div>
      </div>

      <!-- Delete mode: target has it, source doesn't -->
      <div v-else-if="ddlMode === 'delete'" class="absolute inset-0 flex">
        <div class="flex-1 overflow-y-auto">
          <div class="sticky top-0 bg-muted/50 px-3 py-1.5 text-xs font-medium border-b z-10">
            {{ t("diff.sourceDdl") }}
          </div>
          <div class="flex items-center justify-center h-full text-sm text-muted-foreground">
            {{ t("diff.objectNotExistsInSource") }}
          </div>
        </div>
        <div class="flex-1 overflow-y-auto">
          <div class="sticky top-0 bg-muted/50 px-3 py-1.5 text-xs font-medium border-b z-10">
            {{ t("diff.targetDdl") }}
          </div>
          <div class="font-mono text-xs leading-relaxed">
            <div
              v-for="(line, idx) in targetLines"
              :key="idx"
              class="px-3 py-0.5 min-h-[20px]"
              :style="{ backgroundColor: toRgba(ddlColors.addedRowBg, ddlColors.addedRowBgAlpha) }"
            >
              {{ line }}
            </div>
          </div>
        </div>
      </div>

      <!-- Modify/None mode: side-by-side diff -->
      <div v-else class="absolute inset-0 flex">
        <!-- Source DDL -->
        <div ref="sourceDdlRef" class="flex-1 overflow-y-auto" @scroll="syncScroll('source')">
          <div class="sticky top-0 bg-muted/50 px-3 py-1.5 text-xs font-medium border-b z-10">
            {{ t("diff.sourceDdl") }}
          </div>
          <div class="font-mono text-xs leading-relaxed">
            <div
              v-for="(diff, idx) in ddlDiffs"
              :key="`src-${idx}`"
              class="px-3 py-0.5 min-h-[20px]"
              :class="{
                'bg-muted/30': diff.type === 'added',
              }"
              :style="
                diff.type === 'removed'
                  ? { backgroundColor: toRgba(ddlColors.removedRowBg, ddlColors.removedRowBgAlpha) }
                  : diff.type === 'modified'
                    ? { backgroundColor: toRgba(ddlColors.modifiedRowBg, ddlColors.modifiedRowBgAlpha) }
                    : undefined
              "
            >
              <span v-if="diff.type === 'added'" class="text-muted-foreground">&nbsp;</span>
              <template v-else-if="diff.type === 'modified' && diff.charDiffs">
                <span
                  v-for="(charDiff, cIdx) in diff.charDiffs"
                  :key="cIdx"
                  :style="
                    charDiff.source !== charDiff.target
                      ? { backgroundColor: toRgba(ddlColors.modifiedCharBg, ddlColors.modifiedCharBgAlpha) }
                      : undefined
                  "
                  >{{ charDiff.source }}</span
                >
              </template>
              <span v-else>{{ diff.sourceLine }}</span>
            </div>
          </div>
        </div>

        <!-- Target DDL -->
        <div ref="targetDdlRef" class="flex-1 overflow-y-auto" @scroll="syncScroll('target')">
          <div class="sticky top-0 bg-muted/50 px-3 py-1.5 text-xs font-medium border-b z-10">
            {{ t("diff.targetDdl") }}
          </div>
          <div class="font-mono text-xs leading-relaxed">
            <div
              v-for="(diff, idx) in ddlDiffs"
              :key="`tgt-${idx}`"
              class="px-3 py-0.5 min-h-[20px]"
              :class="{
                'bg-muted/30': diff.type === 'removed',
              }"
              :style="
                diff.type === 'added'
                  ? { backgroundColor: toRgba(ddlColors.addedRowBg, ddlColors.addedRowBgAlpha) }
                  : diff.type === 'modified'
                    ? { backgroundColor: toRgba(ddlColors.modifiedRowBg, ddlColors.modifiedRowBgAlpha) }
                    : undefined
              "
            >
              <span v-if="diff.type === 'removed'" class="text-muted-foreground">&nbsp;</span>
              <template v-else-if="diff.type === 'modified' && diff.charDiffs">
                <span
                  v-for="(charDiff, cIdx) in diff.charDiffs"
                  :key="cIdx"
                  :style="
                    charDiff.source !== charDiff.target
                      ? { backgroundColor: toRgba(ddlColors.modifiedCharBg, ddlColors.modifiedCharBgAlpha) }
                      : undefined
                  "
                  >{{ charDiff.target }}</span
                >
              </template>
              <span v-else>{{ diff.targetLine }}</span>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Deploy Script (Selected) -->
    <div v-else-if="activeTab === 'script'" class="flex-1 overflow-hidden relative">
      <div class="flex items-center justify-between p-2 border-b sticky top-0 bg-background z-10">
        <span class="text-xs font-medium">{{ t("diff.deployScriptTitle") }}</span>
        <div class="flex items-center gap-1">
          <Button variant="ghost" size="sm" class="h-7 text-xs" @click="$emit('executeScript')">
            <Play class="w-3 h-3 mr-1" />
            {{ t("diff.executeScript") }}
          </Button>
          <Button variant="ghost" size="sm" class="h-7 text-xs" @click="copyDeploySql">
            <Copy class="w-3 h-3 mr-1" />
            {{ t("diff.copyScript") }}
          </Button>
        </div>
      </div>
      <div class="absolute inset-0 top-[41px] overflow-y-auto">
        <pre class="p-3 font-mono text-xs leading-relaxed whitespace-pre">{{ deploySql }}</pre>
      </div>
    </div>

    <!-- Deploy Script (All) -->
    <div v-else-if="activeTab === 'scriptAll'" class="flex-1 overflow-hidden relative">
      <div class="flex items-center justify-between p-2 border-b sticky top-0 bg-background z-10">
        <span class="text-xs font-medium">{{ t("diff.deployScriptAllTitle") }}</span>
        <Button variant="ghost" size="sm" class="h-7 text-xs" @click="copyDeploySqlAll">
          <Copy class="w-3 h-3 mr-1" />
          {{ t("diff.copyScript") }}
        </Button>
      </div>
      <div class="absolute inset-0 top-[41px] overflow-y-auto">
        <pre class="p-3 font-mono text-xs leading-relaxed whitespace-pre">{{ deploySqlAll }}</pre>
      </div>
    </div>
  </div>
</template>
