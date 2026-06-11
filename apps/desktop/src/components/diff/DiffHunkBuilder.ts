import { diffLines, type Change } from "diff";

export type HunkType = "equal" | "delete" | "insert" | "modify";

export interface DiffLine {
  type: HunkType;
  content: string;
  lineNumber: number | null;
  isPadding: boolean;
}

export interface DiffHunk {
  id: string;
  type: HunkType;
  leftLines: DiffLine[];
  rightLines: DiffLine[];
  // Measured pixel positions after rendering
  leftTop: number;
  leftBottom: number;
  rightTop: number;
  rightBottom: number;
}

function splitLines(value: string): string[] {
  const lines = value.split("\n");
  if (lines.length > 0 && lines[lines.length - 1] === "") lines.pop();
  return lines;
}

function buildLines(lines: string[], type: HunkType, startLineNum: number): DiffLine[] {
  return lines.map((content, idx) => ({
    type,
    content,
    lineNumber: startLineNum + idx,
    isPadding: false,
  }));
}

function buildPaddingLines(count: number): DiffLine[] {
  return Array.from({ length: count }, () => ({
    type: "equal" as HunkType,
    content: "",
    lineNumber: null,
    isPadding: true,
  }));
}

function normalizeDdl(ddl: string): string {
  return ddl
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .split("\n")
    .map((line) => line.replace(/[ \t]+$/g, ""))
    .join("\n");
}

function collectSameKindChanges(changes: Change[], startIdx: number, kind: "added" | "removed"): [string[], number] {
  const parts: string[] = [];
  let i = startIdx;
  while (i < changes.length && changes[i][kind]) {
    parts.push(changes[i].value);
    i++;
  }
  return [parts, i];
}

export function buildHunks(sourceDdl: string, targetDdl: string): DiffHunk[] {
  const normalizedSource = normalizeDdl(sourceDdl);
  const normalizedTarget = normalizeDdl(targetDdl);
  const changes = diffLines(normalizedSource, normalizedTarget, { newlineIsToken: false });

  const hunks: DiffHunk[] = [];
  let leftLineNum = 1;
  let rightLineNum = 1;
  let hunkIdCounter = 0;

  let i = 0;
  while (i < changes.length) {
    const change = changes[i];
    const id = `hunk-${hunkIdCounter++}`;

    if (!change.added && !change.removed) {
      const lines = splitLines(change.value);
      hunks.push({
        id,
        type: "equal",
        leftLines: buildLines(lines, "equal", leftLineNum),
        rightLines: buildLines(lines, "equal", rightLineNum),
        leftTop: 0,
        leftBottom: 0,
        rightTop: 0,
        rightBottom: 0,
      });
      leftLineNum += lines.length;
      rightLineNum += lines.length;
      i++;
      continue;
    }

    if (change.removed) {
      const [removedParts, afterRemoved] = collectSameKindChanges(changes, i, "removed");
      const [addedParts, afterAdded] = collectSameKindChanges(changes, afterRemoved, "added");
      const removedValue = removedParts.join("");
      const removedLines = splitLines(removedValue);

      if (addedParts.length > 0) {
        const addedValue = addedParts.join("");
        const addedLines = splitLines(addedValue);
        const maxLines = Math.max(removedLines.length, addedLines.length);
        const leftReal = buildLines(removedLines, "delete", leftLineNum);
        const rightReal = buildLines(addedLines, "insert", rightLineNum);
        leftLineNum += removedLines.length;
        rightLineNum += addedLines.length;

        hunks.push({
          id,
          type: "modify",
          leftLines: padLines(leftReal, maxLines, "delete"),
          rightLines: padLines(rightReal, maxLines, "insert"),
          leftTop: 0,
          leftBottom: 0,
          rightTop: 0,
          rightBottom: 0,
        });
      } else {
        const maxLines = removedLines.length;
        const leftReal = buildLines(removedLines, "delete", leftLineNum);
        leftLineNum += removedLines.length;
        hunks.push({
          id,
          type: "delete",
          leftLines: leftReal,
          rightLines: buildPaddingLines(maxLines),
          leftTop: 0,
          leftBottom: 0,
          rightTop: 0,
          rightBottom: 0,
        });
      }
      i = afterAdded;
      continue;
    }

    if (change.added) {
      const [addedParts, afterAdded] = collectSameKindChanges(changes, i, "added");
      const addedValue = addedParts.join("");
      const addedLines = splitLines(addedValue);
      const rightReal = buildLines(addedLines, "insert", rightLineNum);
      rightLineNum += addedLines.length;
      hunks.push({
        id,
        type: "insert",
        leftLines: buildPaddingLines(addedLines.length),
        rightLines: rightReal,
        leftTop: 0,
        leftBottom: 0,
        rightTop: 0,
        rightBottom: 0,
      });
      i = afterAdded;
      continue;
    }
  }

  return hunks;
}

function padLines(lines: DiffLine[], targetCount: number, type: HunkType): DiffLine[] {
  if (lines.length >= targetCount) return lines;
  const padding = Array.from({ length: targetCount - lines.length }, () => ({
    type,
    content: "",
    lineNumber: null,
    isPadding: true,
  }));
  return [...lines, ...padding];
}
