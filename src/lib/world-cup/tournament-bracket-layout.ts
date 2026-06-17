/**
 * Classic symmetric knockout bracket — binary-tree Y positions, 9 columns.
 * Left half flows inward; right half mirrors; final & 3rd place in centre.
 */

export type BracketSide = "left" | "center" | "right";

export type BracketGridSlot = {
  matchNumber: number;
  col: number;
  side: BracketSide;
  /** Precomputed vertical centre (px) on the canvas */
  y: number;
};

export const BRACKET_CANVAS_HEIGHT = 580;
export const BRACKET_COL_WIDTH = 156;
export const BRACKET_COL_GAP = 14;
/** Extra horizontal lane between semi-final and final columns (each side) */
export const BRACKET_SF_FINAL_LANE = 48;
export const BRACKET_COL_COUNT = 9;

/** Match bar geometry — shared with TournamentBracketGrid */
export const BRACKET_MATCH_BAR_WIDTH = BRACKET_COL_WIDTH - 8;
export const BRACKET_MATCH_BAR_HEIGHT = 44;
export const BRACKET_FINAL_BAR_WIDTH = 200;
export const BRACKET_FINAL_BAR_HEIGHT = 88;
export const BRACKET_THIRD_PLACE_BELOW_FINAL = 72;

export const BRACKET_COLUMN_LABELS = [
  { key: "R32-L", label: "Round of 32" },
  { key: "R16-L", label: "Round of 16" },
  { key: "QF-L", label: "Quarter-finals" },
  { key: "SF-L", label: "Semi-finals" },
  { key: "C", label: "Final" },
  { key: "SF-R", label: "Semi-finals" },
  { key: "QF-R", label: "Quarter-finals" },
  { key: "R16-R", label: "Round of 16" },
  { key: "R32-R", label: "Round of 32" },
];

/** Parent ← two feeder matches (FIFA 2026 wiring) */
export const BRACKET_FEEDS: Record<number, [number, number]> = {
  89: [74, 77],
  90: [73, 75],
  91: [76, 78],
  92: [79, 80],
  94: [81, 82],
  93: [83, 84],
  96: [85, 87],
  95: [86, 88],
  97: [89, 90],
  99: [91, 92],
  98: [93, 94],
  100: [95, 96],
  101: [97, 98],
  102: [99, 100],
  104: [101, 102],
  103: [101, 102],
};

/**
 * Visual bracket wiring — left/right trees merge within each half.
 * (FIFA pairs 97×98 and 99×100 at SF; the grid uses same-half QF merges for readable connectors.)
 */
export const BRACKET_DISPLAY_FEEDS: Record<number, [number, number]> = {
  ...BRACKET_FEEDS,
  101: [97, 99],
  102: [98, 100],
};

const LEFT_R32 = [74, 77, 73, 75, 76, 78, 79, 80] as const;
const RIGHT_R32 = [81, 82, 83, 84, 85, 87, 86, 88] as const;

const MATCH_COL: Record<number, number> = {
  74: 0, 77: 0, 73: 0, 75: 0, 76: 0, 78: 0, 79: 0, 80: 0,
  89: 1, 90: 1, 91: 1, 92: 1,
  97: 2, 99: 2,
  101: 3,
  104: 4,
  103: 4,
  102: 5,
  98: 6, 100: 6,
  94: 7, 93: 7, 96: 7, 95: 7,
  81: 8, 82: 8, 83: 8, 84: 8, 85: 8, 87: 8, 86: 8, 88: 8,
};

const MATCH_SIDE: Record<number, BracketSide> = {
  104: "center",
  103: "center",
};

for (const n of [...LEFT_R32, 89, 90, 91, 92, 97, 99, 101]) {
  MATCH_SIDE[n] = "left";
}
for (const n of [...RIGHT_R32, 94, 93, 96, 95, 98, 100, 102]) {
  MATCH_SIDE[n] = "right";
}

function computeMatchY(): Map<number, number> {
  const y = new Map<number, number>();
  const leafStride = BRACKET_CANVAS_HEIGHT / 8;

  LEFT_R32.forEach((m, i) => y.set(m, (i + 0.5) * leafStride));
  RIGHT_R32.forEach((m, i) => y.set(m, (i + 0.5) * leafStride));

  const order = [
    89, 90, 91, 92, 94, 93, 96, 95,
    97, 99, 98, 100,
    101, 102,
    104,
  ];

  for (const parent of order) {
    const feeders = BRACKET_DISPLAY_FEEDS[parent];
    if (!feeders) continue;
    const [a, b] = feeders;
    const ya = y.get(a);
    const yb = y.get(b);
    if (ya == null || yb == null) continue;
    y.set(parent, (ya + yb) / 2);
  }

  const yFinal = y.get(104);
  if (yFinal != null) {
    const finalHalf = (BRACKET_FINAL_BAR_HEIGHT + 14) / 2;
    const thirdHalf = (BRACKET_MATCH_BAR_HEIGHT + 22) / 2;
    y.set(103, yFinal + finalHalf + BRACKET_THIRD_PLACE_BELOW_FINAL + thirdHalf);
  }

  return y;
}

const MATCH_Y = computeMatchY();

export const BRACKET_GRID_SLOTS: BracketGridSlot[] = Object.keys(MATCH_COL).map(
  (key) => {
    const matchNumber = Number(key);
    return {
      matchNumber,
      col: MATCH_COL[matchNumber],
      side: MATCH_SIDE[matchNumber],
      y: MATCH_Y.get(matchNumber) ?? BRACKET_CANVAS_HEIGHT / 2,
    };
  }
);

export function getBracketSlot(matchNumber: number): BracketGridSlot | undefined {
  return BRACKET_GRID_SLOTS.find((s) => s.matchNumber === matchNumber);
}

function columnGapAfter(col: number): number {
  return col === 3 || col === 4
    ? BRACKET_COL_GAP + BRACKET_SF_FINAL_LANE
    : BRACKET_COL_GAP;
}

export function colLeft(col: number): number {
  let x = 0;
  for (let c = 0; c < col; c++) {
    x += BRACKET_COL_WIDTH + columnGapAfter(c);
  }
  return x;
}

export function colRight(col: number): number {
  return colLeft(col) + BRACKET_COL_WIDTH;
}

export function bracketGridWidth(): number {
  let width = BRACKET_COL_COUNT * BRACKET_COL_WIDTH;
  for (let c = 0; c < BRACKET_COL_COUNT - 1; c++) {
    width += columnGapAfter(c);
  }
  return width;
}

/** @deprecated grid-row layout — use slot.y */
export const BRACKET_ROW_COUNT = 16;
export const BRACKET_ROW_HEIGHT = 28;
export const BRACKET_ROW_GAP = 8;

export function matchBlockHeight(matchNumber: number): number {
  if (matchNumber === 104) return BRACKET_FINAL_BAR_HEIGHT + 14;
  if (matchNumber === 103) return BRACKET_MATCH_BAR_HEIGHT + 22;
  return BRACKET_MATCH_BAR_HEIGHT;
}

export function colCenterX(col: number): number {
  return colLeft(col) + BRACKET_COL_WIDTH / 2;
}

export function slotCenterY(slot: BracketGridSlot): number {
  return slot.y;
}

/** Left edge of the rendered match bar for connector anchoring */
export function matchBarLeft(slot: BracketGridSlot): number {
  if (slot.side === "right") {
    return colLeft(slot.col) + (BRACKET_COL_WIDTH - BRACKET_MATCH_BAR_WIDTH);
  }
  if (slot.side === "center") {
    return colLeft(slot.col) + (BRACKET_COL_WIDTH - BRACKET_FINAL_BAR_WIDTH) / 2;
  }
  return colLeft(slot.col);
}

/** Right edge of the rendered match bar for connector anchoring */
export function matchBarRight(slot: BracketGridSlot): number {
  const width =
    slot.side === "center" ? BRACKET_FINAL_BAR_WIDTH : BRACKET_MATCH_BAR_WIDTH;
  return matchBarLeft(slot) + width;
}

export function bracketGridHeight(): number {
  const thirdSlot = getBracketSlot(103);
  if (!thirdSlot) return BRACKET_CANVAS_HEIGHT;
  return Math.max(
    BRACKET_CANVAS_HEIGHT,
    thirdSlot.y + matchBlockHeight(103) / 2 + 16
  );
}

export type BracketScrollSegment = "left" | "final" | "right";

/** Horizontal scroll targets for mobile bracket navigation */
export function getBracketScrollAnchors(viewportWidth: number): Record<BracketScrollSegment, number> {
  const gridWidth = bracketGridWidth();
  const maxScroll = Math.max(0, gridWidth - viewportWidth);
  const finalSlot = getBracketSlot(104);
  const finalCenterX = finalSlot
    ? matchBarLeft(finalSlot) + BRACKET_FINAL_BAR_WIDTH / 2
    : colCenterX(4);
  const finalScroll = Math.max(0, Math.min(finalCenterX - viewportWidth / 2, maxScroll));
  return { left: 0, final: finalScroll, right: maxScroll };
}

export function resolveBracketScrollSegment(
  scrollLeft: number,
  viewportWidth: number
): BracketScrollSegment {
  const anchors = getBracketScrollAnchors(viewportWidth);
  const midLeft = anchors.final * 0.45;
  const midRight = anchors.final + (anchors.right - anchors.final) * 0.55;
  if (scrollLeft <= midLeft) return "left";
  if (scrollLeft >= midRight) return "right";
  return "final";
}
