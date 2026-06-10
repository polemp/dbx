<script setup lang="ts">
import { computed } from "vue";
import { useI18n } from "vue-i18n";
import type { SchemaDiffObject, DiffOperationType, DiffObjectKind } from "@/lib/schemaDiff";
import {
  Table,
  Eye,
  FunctionSquare,
  ListOrdered,
  ScrollText,
  UserCog,
  ListTree,
  Link2,
  Zap,
  ChevronDown,
  ChevronRight,
  ArrowRightLeft,
  PlusCircle,
  XCircle,
  MinusCircle,
} from "@lucide/vue";

const { t } = useI18n();

interface ObjectTypeGroup {
  kind: DiffObjectKind;
  label: string;
  objects: SchemaDiffObject[];
  expanded: boolean;
}

interface OperationGroup {
  operationType: DiffOperationType;
  label: string;
  count: number;
  selectedCount: number;
  expanded: boolean;
  typeGroups: ObjectTypeGroup[];
}

const props = defineProps<{
  groups: OperationGroup[];
  selectedObjectId?: string | null;
}>();

const emit = defineEmits<{
  (e: "toggleGroup", operationType: DiffOperationType): void;
  (e: "toggleTypeGroup", operationType: DiffOperationType, kind: DiffObjectKind): void;
  (e: "toggleGroupSelection", operationType: DiffOperationType, selected: boolean): void;
  (e: "toggleTypeSelection", operationType: DiffOperationType, kind: DiffObjectKind, selected: boolean): void;
  (e: "toggleObjectSelection", objectId: string, selected: boolean): void;
  (e: "selectObject", object: SchemaDiffObject): void;
}>();

const operationIcons: Record<DiffOperationType, any> = {
  modify: ArrowRightLeft,
  create: PlusCircle,
  delete: XCircle,
  none: MinusCircle,
};

const operationColors: Record<DiffOperationType, string> = {
  modify: "text-blue-500",
  create: "text-green-500",
  delete: "text-red-500",
  none: "text-muted-foreground",
};

const operationBgColors: Record<DiffOperationType, string> = {
  modify: "bg-blue-500/10 border-blue-500/20",
  create: "bg-green-500/10 border-green-500/20",
  delete: "bg-red-500/10 border-red-500/20",
  none: "bg-muted/30 border-muted",
};

function getObjectIcon(kind: DiffObjectKind) {
  switch (kind) {
    case "table":
      return Table;
    case "view":
      return Eye;
    case "function":
      return FunctionSquare;
    case "sequence":
      return ListOrdered;
    case "rule":
      return ScrollText;
    case "owner":
      return UserCog;
    case "index":
      return ListTree;
    case "foreignKey":
      return Link2;
    case "trigger":
      return Zap;
    default:
      return Table;
  }
}

function getObjectIconColor(kind: DiffObjectKind): string {
  switch (kind) {
    case "table":
      return "text-amber-500";
    case "view":
      return "text-cyan-500";
    case "function":
      return "text-purple-500";
    case "sequence":
      return "text-orange-500";
    case "rule":
      return "text-pink-500";
    case "owner":
      return "text-indigo-500";
    case "index":
      return "text-teal-500";
    case "foreignKey":
      return "text-lime-500";
    case "trigger":
      return "text-rose-500";
    default:
      return "text-muted-foreground";
  }
}

function getObjectTypeLabel(kind: DiffObjectKind): string {
  switch (kind) {
    case "table":
      return "表";
    case "view":
      return "视图";
    case "function":
      return "函数";
    case "sequence":
      return "序列";
    case "rule":
      return "规则";
    case "owner":
      return "所有者";
    case "index":
      return "索引";
    case "foreignKey":
      return "外键";
    case "trigger":
      return "触发器";
    default:
      return kind;
  }
}

function isGroupFullySelected(group: OperationGroup): boolean {
  return group.count > 0 && group.selectedCount === group.count;
}

function isGroupPartiallySelected(group: OperationGroup): boolean {
  return group.selectedCount > 0 && group.selectedCount < group.count;
}

function isTypeGroupFullySelected(typeGroup: ObjectTypeGroup): boolean {
  return typeGroup.objects.length > 0 && typeGroup.objects.every((o) => o.selected);
}

function isTypeGroupPartiallySelected(typeGroup: ObjectTypeGroup): boolean {
  const selectedCount = typeGroup.objects.filter((o) => o.selected).length;
  return selectedCount > 0 && selectedCount < typeGroup.objects.length;
}

function onGroupCheckboxChange(group: OperationGroup, event: Event) {
  const checked = (event.target as HTMLInputElement).checked;
  emit("toggleGroupSelection", group.operationType, checked);
}

function onTypeCheckboxChange(group: OperationGroup, typeGroup: ObjectTypeGroup, event: Event) {
  const checked = (event.target as HTMLInputElement).checked;
  emit("toggleTypeSelection", group.operationType, typeGroup.kind, checked);
}

function onObjectCheckboxChange(obj: SchemaDiffObject, event: Event) {
  const checked = (event.target as HTMLInputElement).checked;
  emit("toggleObjectSelection", obj.id, checked);
}
</script>

<template>
  <div class="space-y-1">
    <!-- Header -->
    <div class="grid grid-cols-[1fr_60px_1fr] gap-2 px-2 py-1.5 text-xs font-medium text-muted-foreground border-b">
      <div class="text-center">{{ t("diff.sourceObject") }}</div>
      <div class="text-center">{{ t("diff.operation") }}</div>
      <div class="text-center">{{ t("diff.targetObject") }}</div>
    </div>

    <!-- Operation Groups -->
    <div v-for="group in groups" :key="group.operationType" class="border rounded-md overflow-hidden">
      <!-- Operation Group Header -->
      <button
        class="flex items-center gap-2 w-full px-3 py-2 text-sm font-medium transition-colors"
        :class="operationBgColors[group.operationType]"
        @click="$emit('toggleGroup', group.operationType)"
      >
        <ChevronDown v-if="group.expanded" class="w-4 h-4 shrink-0" />
        <ChevronRight v-else class="w-4 h-4 shrink-0" />

        <input
          type="checkbox"
          class="accent-primary shrink-0"
          :checked="isGroupFullySelected(group)"
          :indeterminate="isGroupPartiallySelected(group)"
          @click.stop
          @change="onGroupCheckboxChange(group, $event)"
        />

        <component
          :is="operationIcons[group.operationType]"
          class="w-4 h-4 shrink-0"
          :class="operationColors[group.operationType]"
        />
        <span :class="operationColors[group.operationType]">{{ group.label }}</span>
        <span class="text-xs text-muted-foreground ml-1">
          ({{ t("diff.selectedCount", { selected: group.selectedCount, total: group.count }) }})
        </span>
      </button>

      <!-- Type Groups -->
      <div v-if="group.expanded" class="divide-y divide-border/30">
        <div v-for="typeGroup in group.typeGroups" :key="typeGroup.kind" class="border-l-2 border-l-border/50 ml-2">
          <!-- Type Group Header -->
          <button
            class="flex items-center gap-2 w-full px-3 py-1.5 text-xs font-medium hover:bg-accent/20 transition-colors"
            @click="$emit('toggleTypeGroup', group.operationType, typeGroup.kind)"
          >
            <ChevronDown v-if="typeGroup.expanded" class="w-3.5 h-3.5 shrink-0" />
            <ChevronRight v-else class="w-3.5 h-3.5 shrink-0" />

            <input
              type="checkbox"
              class="accent-primary shrink-0"
              :checked="isTypeGroupFullySelected(typeGroup)"
              :indeterminate="isTypeGroupPartiallySelected(typeGroup)"
              @click.stop
              @change="onTypeCheckboxChange(group, typeGroup, $event)"
            />

            <component
              :is="getObjectIcon(typeGroup.kind)"
              class="w-3.5 h-3.5 shrink-0"
              :class="getObjectIconColor(typeGroup.kind)"
            />
            <span>{{ getObjectTypeLabel(typeGroup.kind) }}</span>
            <span class="text-xs text-muted-foreground">({{ typeGroup.objects.length }})</span>
          </button>

          <!-- Objects -->
          <div v-if="typeGroup.expanded" class="divide-y divide-border/20">
            <div
              v-for="obj in typeGroup.objects"
              :key="obj.id"
              class="grid grid-cols-[1fr_60px_1fr] gap-2 px-3 py-1 items-center hover:bg-accent/30 cursor-pointer ml-8"
              :class="{ 'bg-primary/10': selectedObjectId === obj.id }"
              @click="$emit('selectObject', obj)"
            >
              <!-- Source -->
              <div class="flex items-center gap-2 min-w-0">
                <input
                  type="checkbox"
                  class="accent-primary shrink-0"
                  :checked="obj.selected"
                  @click.stop
                  @change="onObjectCheckboxChange(obj, $event)"
                />
                <component
                  :is="getObjectIcon(obj.objectKind)"
                  class="w-3.5 h-3.5 shrink-0"
                  :class="getObjectIconColor(obj.objectKind)"
                />
                <span
                  class="text-xs truncate"
                  :class="obj.operationType === 'delete' ? 'text-red-500 line-through' : ''"
                >
                  {{ obj.sourceName || obj.name }}
                </span>
              </div>

              <!-- Operation -->
              <div class="flex justify-center">
                <component
                  :is="operationIcons[obj.operationType]"
                  class="w-3.5 h-3.5"
                  :class="operationColors[obj.operationType]"
                />
              </div>

              <!-- Target -->
              <div class="flex items-center gap-2 min-w-0">
                <component
                  :is="getObjectIcon(obj.objectKind)"
                  class="w-3.5 h-3.5 shrink-0"
                  :class="getObjectIconColor(obj.objectKind)"
                />
                <span class="text-xs truncate" :class="obj.operationType === 'create' ? 'text-green-500' : ''">
                  {{ obj.targetName || obj.name }}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
