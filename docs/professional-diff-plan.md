# Professional Diff View Implementation Plan

## 1. Goal

Replace the current line-by-line DDL comparison panel (`SchemaDiffDdlPanel.vue`) with a professional diff view similar to GitHub, JetBrains IDEs, and Beyond Compare:

- Delete hunks are shown only on the left side (red background).
- Insert hunks are shown only on the right side (green background).
- Modify hunks are shown on both sides (blue background) with optional character-level highlighting.
- Equal code is strictly vertically aligned.
- SVG Bézier curves connect the left delete hunk with the right insert hunk to visually indicate "this block was replaced by that block".

Color semantics follow the standard convention from the reference image:

| Operation | Background | Text     |
|-----------|------------|----------|
| Delete    | red-100    | red-800  |
| Insert    | green-100  | green-800|
| Modify    | blue-100   | blue-800 |
| Equal     | none       | default  |

## 2. Current Limitation

The current implementation renders a strict 1:1 row table:

```vue
<div v-for="(row, idx) in diffRows" class="flex">
  <left-line />
  <right-line />
</div>
```

This forces every left line to share a row with a right line. Delete and insert blocks must be padded with empty lines, and there is no visual connector between replaced blocks. It cannot produce the reference image effect.

## 3. Proposed Architecture

```text
SchemaDiffDdlPanel.vue
├── DiffHunkBuilder.ts          # Convert diffLines() output into hunks
├── DiffLeftPane.vue            # Render left DDL column
├── DiffRightPane.vue           # Render right DDL column
├── DiffSvgConnector.vue        # SVG Bézier curve overlay
└── useDiffScrollSync.ts        # Synchronized scrolling + curve recalculation
```

### 3.1 Data Structures

```typescript
type HunkType = "equal" | "delete" | "insert" | "modify";

interface DiffLine {
  type: HunkType;
  content: string;
  lineNumber: number | null;
  isPadding: boolean; // true if inserted only for alignment
}

interface DiffHunk {
  id: string;
  type: HunkType;
  leftLines: DiffLine[];
  rightLines: DiffLine[];
  // Pixel positions after rendering, computed by useDiffLayout
  leftTop: number;
  leftBottom: number;
  rightTop: number;
  rightBottom: number;
}
```

### 3.2 Hunk Builder Algorithm

Input: `Array<Change>` from `diffLines()`.

```typescript
function buildHunks(changes: Change[]): DiffHunk[] {
  const hunks: DiffHunk[] = [];
  let i = 0;
  while (i < changes.length) {
    const curr = changes[i];
    if (curr.removed) {
      // Collect consecutive removed changes
      const removedChanges: Change[] = [curr];
      let j = i + 1;
      while (j < changes.length && changes[j].removed) {
        removedChanges.push(changes[j]);
        j++;
      }
      // Collect consecutive added changes immediately following
      const addedChanges: Change[] = [];
      while (j < changes.length && changes[j].added) {
        addedChanges.push(changes[j]);
        j++;
      }
      if (addedChanges.length > 0) {
        hunks.push({
          type: "modify",
          leftLines: buildLines(removedChanges, "delete"),
          rightLines: buildLines(addedChanges, "insert"),
        });
      } else {
        hunks.push({
          type: "delete",
          leftLines: buildLines(removedChanges, "delete"),
          rightLines: createPaddingLines(lineCount(removedChanges)),
        });
      }
      i = j;
    } else if (curr.added) {
      const addedChanges: Change[] = [curr];
      let j = i + 1;
      while (j < changes.length && changes[j].added) {
        addedChanges.push(changes[j]);
        j++;
      }
      hunks.push({
        type: "insert",
        leftLines: createPaddingLines(lineCount(addedChanges)),
        rightLines: buildLines(addedChanges, "insert"),
      });
      i = j;
    } else {
      hunks.push({
        type: "equal",
        leftLines: buildLines([curr], "equal"),
        rightLines: buildLines([curr], "equal"),
      });
      i++;
    }
  }
  return hunks;
}
```

### 3.3 Alignment Strategy

For each hunk, compute the rendered height in lines:

- `equal`: left and right have the same lines.
- `delete`: left shows real lines, right shows empty padding lines.
- `insert`: left shows empty padding lines, right shows real lines.
- `modify`: `maxHeight = max(leftLines.length, rightLines.length)`. The shorter side is padded with empty lines so that the hunk occupies the same vertical space on both sides.

This guarantees that equal code above and below any hunk remains vertically aligned.

### 3.4 SVG Bézier Connector

For every `delete` hunk followed by an `insert` hunk (or a `modify` hunk split into delete/insert sub-hunks), draw a cubic Bézier curve from the left side to the right side:

```typescript
function computeBezierPath(hunk: DiffHunk, containerWidth: number): string {
  const leftY = (hunk.leftTop + hunk.leftBottom) / 2;
  const rightY = (hunk.rightTop + hunk.rightBottom) / 2;
  const midX = containerWidth / 2;
  const controlOffset = midX * 0.3;
  return `M 0,${leftY}
          C ${controlOffset},${leftY}
            ${containerWidth - controlOffset},${rightY}
            ${containerWidth},${rightY}`;
}
```

The SVG overlay is absolutely positioned over both panes and uses `pointer-events-none` so it does not block scrolling or text selection.

### 3.5 Scroll Synchronization

Because left and right panes render different content but must stay vertically aligned, scrolling one pane must scroll the other to the same scroll ratio. After each scroll event (throttled with `requestAnimationFrame`), recompute the screen coordinates of every visible hunk and update the SVG paths.

```typescript
function useDiffLayout(leftPane: Ref<HTMLElement>, rightPane: Ref<HTMLElement>, hunks: Ref<DiffHunk[]>) {
  function measure() {
    hunks.value.forEach((hunk) => {
      const leftEl = leftPane.value?.querySelector(`[data-hunk-id="${hunk.id}"]`);
      const rightEl = rightPane.value?.querySelector(`[data-hunk-id="${hunk.id}"]`);
      if (leftEl) {
        const rect = leftEl.getBoundingClientRect();
        const parent = leftPane.value!.getBoundingClientRect();
        hunk.leftTop = rect.top - parent.top + leftPane.value!.scrollTop;
        hunk.leftBottom = rect.bottom - parent.top + leftPane.value!.scrollTop;
      }
      if (rightEl) {
        const rect = rightEl.getBoundingClientRect();
        const parent = rightPane.value!.getBoundingClientRect();
        hunk.rightTop = rect.top - parent.top + rightPane.value!.scrollTop;
        hunk.rightBottom = rect.bottom - parent.top + rightPane.value!.scrollTop;
      }
    });
  }
  // Re-measure after scroll and after DOM updates
  return { measure };
}
```

### 3.6 Character-Level Diff Inside Modify Hunks

For `modify` hunks, each pair of left/right lines is compared character-by-character to highlight the changed characters:

- If both lines are equal: render as equal.
- If lines differ: split each line into segments and render changed segments with a darker background (e.g., blue-200).

The existing `computeCharDiffs` function can be reused after minor cleanup.

## 4. Rendering Details

### 4.1 Left Pane

```vue
<template>
  <div ref="leftPane" class="w-1/2 overflow-auto font-mono text-sm" @scroll="onScroll">
    <template v-for="hunk in hunks" :key="hunk.id">
      <div :data-hunk-id="hunk.id" class="hunk">
        <div
          v-for="(line, idx) in hunk.leftLines"
          :key="idx"
          :class="lineClass(line, 'left')"
        >
          <span class="line-number">{{ line.lineNumber ?? "" }}</span>
          <span class="content whitespace-pre">{{ line.isPadding ? "\u00A0" : line.content }}</span>
        </div>
      </div>
    </template>
  </div>
</template>
```

### 4.2 Right Pane

Identical structure, using `hunk.rightLines` and `lineClass(line, 'right')`.

### 4.3 SVG Overlay

```vue
<svg class="absolute inset-0 pointer-events-none z-10" :width="containerWidth" :height="containerHeight">
  <path
    v-for="hunk in connectableHunks"
    :key="hunk.id"
    :d="computeBezierPath(hunk)"
    :stroke="connectionColor(hunk)"
    fill="none"
    stroke-width="2"
    opacity="0.6"
  />
</svg>
```

`connectableHunks` includes every hunk that has both a left and right visual presence, i.e. `modify` hunks and adjacent `delete`/`insert` pairs.

## 5. Color Scheme

Tailwind color mapping (matches the reference image):

```css
.diff-delete-bg { background-color: #fee2e2; }   /* red-100 */
.diff-delete-text { color: #991b1b; }            /* red-800 */
.diff-delete-strike { text-decoration: line-through; }

.diff-insert-bg { background-color: #dcfce7; }   /* green-100 */
.diff-insert-text { color: #166534; }            /* green-800 */

.diff-modify-bg { background-color: #dbeafe; }   /* blue-100 */
.diff-modify-text { color: #1e40af; }            /* blue-800 */
.diff-modify-char-bg { background-color: #93c5fd; } /* blue-300 */

.diff-empty { background-color: transparent; }
```

The existing `settingsStore.editorSettings.customThemes.ddlColors` fields will be remapped:

- `removedRowBg` → delete red
- `addedRowBg` → insert green
- `modifiedRowBg` → modify blue
- `modifiedCharBg` → modify char highlight

## 6. Performance Considerations

| Concern | Mitigation |
|---------|------------|
| Large DDL files with thousands of lines | Use virtual scrolling (`vue-virtual-scroller` or custom implementation) and render only visible hunks. |
| Expensive SVG path updates on scroll | Throttle measurement to `requestAnimationFrame`; only update paths for visible hunks. |
| DOM measurement cost | Cache line height and use fixed line-height CSS; measure only when content or size changes. |
| Character diff cost | Run character diff lazily for visible modify lines only. |

## 7. Migration Path

1. Create new composables and components under `apps/desktop/src/components/diff/`.
2. Keep `SchemaDiffDdlPanel.vue` as the container but replace its internal diff rendering with the new hunk-based components.
3. Preserve the existing tab UI (DDL / Deploy Script / Deploy Script All).
4. Preserve the existing scroll sync behavior.
5. Update DDL color theme mapping.
6. Add a feature flag if needed to allow A/B comparison during development.

## 8. Testing Checklist

- [ ] Identical DDL shows no diff highlights.
- [ ] CRLF and trailing whitespace do not cause false modify.
- [ ] Delete-only object shows red block on left, empty padding on right.
- [ ] Insert-only object shows green block on right, empty padding on left.
- [ ] Modify object shows blue block on both sides with char-level highlighting.
- [ ] Adjacent delete + insert blocks are connected by a smooth SVG curve.
- [ ] Equal code above and below a hunk stays vertically aligned.
- [ ] Scrolling left pane scrolls right pane to the same position.
- [ ] SVG curves update correctly while scrolling.
- [ ] Large DDL (1000+ lines) remains responsive.

## 9. Files to Create or Modify

| Path | Action |
|------|--------|
| `apps/desktop/src/components/diff/SchemaDiffDdlPanel.vue` | Refactor container to use new components |
| `apps/desktop/src/components/diff/DiffHunkBuilder.ts` | New: hunk building logic |
| `apps/desktop/src/components/diff/DiffLeftPane.vue` | New: left column rendering |
| `apps/desktop/src/components/diff/DiffRightPane.vue` | New: right column rendering |
| `apps/desktop/src/components/diff/DiffSvgConnector.vue` | New: SVG curve overlay |
| `apps/desktop/src/composables/useDiffScrollSync.ts` | New: scroll sync + layout measurement |
| `apps/desktop/src/stores/settingsStore.ts` | Update DDL color theme mapping |

## 10. Estimated Effort

- Core hunk builder and alignment: 4-6 hours
- Left/right pane rendering: 4-6 hours
- SVG connector + scroll sync: 6-10 hours
- Theme color update: 1-2 hours
- Testing and polish: 4-6 hours
- **Total: 2-3 days**
