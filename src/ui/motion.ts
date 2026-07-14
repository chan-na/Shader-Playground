/**
 * design/README.md §Motion: 90–150ms · cubic-bezier(.2,.7,.3,1). The CSS side
 * uses cssVars()'s injected var(--motion-duration-min/max)/var(--motion-easing)
 * (see src/theme.ts); this module is the JS-API counterpart — numeric/string
 * constants for call sites that can't take a CSS var (e.g. React Flow's
 * `duration` option on zoomIn/zoomOut/fitView).
 */
import { tokens } from "../theme";

/** 90–150ms 밴드의 상한 — 패널 전환·fit-view 등 "큰" 모션용. */
export const MOTION_MAX_MS = tokens.motion.durationMs.max; // 150
/** 밴드 중간값 — 줌 스텝 등 중간 크기 모션용 (min과 max 사이 산술 평균). */
export const MOTION_MID_MS = Math.round(
  (tokens.motion.durationMs.min + tokens.motion.durationMs.max) / 2,
); // 120
/** 상태 표시용 펄스 shorthand (keyframe은 src/index.css의 sp-pulse, 주기 1.4s는
 *  design/System States.dc.html의 설계값 — 90-150ms 밴드는 '전환'용이고 상태
 *  펄스 루프는 별도 주기를 갖는다). */
export const STATUS_PULSE_ANIMATION = "sp-pulse 1.4s ease-in-out infinite";
