<script setup lang="ts">
import { computed } from "vue";
import type { DiffHunk } from "@/components/diff/DiffHunkBuilder";

const props = defineProps<{
  hunks: DiffHunk[];
  containerWidth: number;
  containerHeight: number;
}>();

const connectionPaths = computed(() => {
  const paths: { d: string; stroke: string; id: string }[] = [];
  const midX = props.containerWidth / 2;
  const controlOffset = midX * 0.3;

  for (const hunk of props.hunks) {
    if (hunk.leftBottom <= hunk.leftTop || hunk.rightBottom <= hunk.rightTop) continue;
    if (hunk.leftBottom < 0 || hunk.rightBottom < 0) continue;
    if (hunk.leftTop > props.containerHeight || hunk.rightTop > props.containerHeight) continue;

    const leftY = (hunk.leftTop + hunk.leftBottom) / 2;
    const rightY = (hunk.rightTop + hunk.rightBottom) / 2;

    paths.push({
      id: hunk.id,
      d: `M 0,${leftY} C ${controlOffset},${leftY} ${props.containerWidth - controlOffset},${rightY} ${props.containerWidth},${rightY}`,
      stroke: getStrokeColor(hunk.type),
    });
  }
  return paths;
});

function getStrokeColor(type: DiffHunk["type"]): string {
  switch (type) {
    case "delete":
      return "rgba(239, 68, 68, 0.6)"; // red-500
    case "insert":
      return "rgba(34, 197, 94, 0.6)"; // green-500
    case "modify":
      return "rgba(59, 130, 246, 0.6)"; // blue-500
    default:
      return "rgba(156, 163, 175, 0.4)";
  }
}
</script>

<template>
  <svg
    class="absolute inset-0 pointer-events-none z-10"
    :width="containerWidth"
    :height="containerHeight"
    xmlns="http://www.w3.org/2000/svg"
  >
    <path
      v-for="path in connectionPaths"
      :key="path.id"
      :d="path.d"
      :stroke="path.stroke"
      fill="none"
      stroke-width="2"
    />
  </svg>
</template>
