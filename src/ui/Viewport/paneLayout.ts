import { splitLayout } from "../../core/graph/execute";

/** A CSS-percentage (or calc()) rectangle for absolutely-positioned overlays. */
export interface CssRect {
  left: string;
  top: string;
  width: string;
  height: string;
}

// splitLayout works in an arbitrary pixel-space canvas size; 10000×10000 gives
// exact percentages (÷100) for every split it produces (1/2/3/4-way), with no
// rounding drift from Math.floor divisions by 2.
const LAYOUT_UNITS = 10000;

/**
 * Pane rectangles as CSS percentages, derived from the exact same split
 * geometry `execute.ts`'s composite pass draws into (`splitLayout`), so the
 * DOM overlay can never drift from the GL composite. `splitLayout` is GL
 * coordinate space (y-up, origin bottom-left) while CSS `top` grows downward,
 * so each cell's y is flipped: `top = (LAYOUT_UNITS - y - h) / 100`.
 */
export function paneCssRects(n: number): CssRect[] {
  const cells = splitLayout(n, LAYOUT_UNITS, LAYOUT_UNITS);
  return cells.map(({ x, y, w, h }) => ({
    left: `${x / 100}%`,
    top: `${(LAYOUT_UNITS - y - h) / 100}%`,
    width: `${w / 100}%`,
    height: `${h / 100}%`,
  }));
}

const VERTICAL_FULL: CssRect = {
  left: "calc(50% - 0.5px)",
  top: "0%",
  width: "1px",
  height: "100%",
};

const HORIZONTAL_FULL: CssRect = {
  left: "0%",
  top: "calc(50% - 0.5px)",
  width: "100%",
  height: "1px",
};

const VERTICAL_TOP_HALF: CssRect = {
  left: "calc(50% - 0.5px)",
  top: "0%",
  width: "1px",
  height: "50%",
};

/**
 * 각 pane이 뷰포트 하단 행에 닿는지 여부 [D3]. splitLayout은 GL 좌표(y-up,
 * 원점 좌하단)이므로 y === 0 이 곧 컨테이너 하단 접촉이다. 컴팩트 트랜스포트
 * 바(≤990px [C-6])가 하단 캡션을 덮지 않도록 PaneOverlay가 이 플래그로 오프셋
 * 클래스를 단다.
 */
export function bottomRowFlags(n: number): boolean[] {
  return splitLayout(n, LAYOUT_UNITS, LAYOUT_UNITS).map((c) => c.y === 0);
}

/**
 * 1px divider seam rectangles overlaid on the pane grid (design/Viewport.dc.html
 * L67: grid `gap:1px` / `background:#17191e` — border.headerDivider). One
 * rect per seam; `PaneOverlay` paints each with `var(--border-header-divider)`.
 */
export function dividerCssRects(n: number): CssRect[] {
  if (n <= 1) return [];
  if (n === 2) return [VERTICAL_FULL];
  if (n === 3) return [HORIZONTAL_FULL, VERTICAL_TOP_HALF];
  return [VERTICAL_FULL, HORIZONTAL_FULL];
}
