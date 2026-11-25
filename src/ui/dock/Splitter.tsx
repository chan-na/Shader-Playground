import type {
  KeyboardEvent as ReactKeyboardEvent,
  PointerEvent as ReactPointerEvent,
} from "react";
import { useRef } from "react";

export type SplitterOrientation = "vertical" | "horizontal";

export interface SplitterProps {
  /** vertical = 좌우로 늘어선 패널을 나누는 세로선 (X축 드래그).
   *  horizontal = 위아래로 늘어선 패널을 나누는 가로선 (Y축 드래그). */
  orientation: SplitterOrientation;
  /** 포인터/키보드 이동량(px). 양수 = 오른쪽/아래로 이동. */
  onDelta: (px: number) => void;
  label: string;
  /** 추가 className(예: 최대화 중 인접 스플리터를 숨기는 shell-slot--hidden). */
  className?: string;
}

/** 키보드 화살표 1회 입력당 이동시키는 픽셀 양. */
const ARROW_STEP_PX = 16;

/**
 * orientation·key에 대응하는 부호 있는 델타(px)를 반환한다.
 * 대응하지 않는 키(예: horizontal에서 ArrowLeft)는 null.
 * Splitter 컴포넌트와 분리해 export해두면 실제 키보드 이벤트 디스패치 없이도
 * (@testing-library/react 미사용) 순수 함수로 단위 테스트할 수 있다.
 */
export function arrowKeyDelta(
  orientation: SplitterOrientation,
  key: string,
): number | null {
  if (orientation === "vertical") {
    if (key === "ArrowLeft") return -ARROW_STEP_PX;
    if (key === "ArrowRight") return ARROW_STEP_PX;
    return null;
  }
  if (key === "ArrowUp") return -ARROW_STEP_PX;
  if (key === "ArrowDown") return ARROW_STEP_PX;
  return null;
}

/** 도킹 패널 사이의 리사이즈 핸들. 포인터 드래그 + 화살표 키보드를 모두 지원한다. */
export function Splitter({
  orientation,
  onDelta,
  label,
  className,
}: SplitterProps) {
  const draggingRef = useRef(false);
  const lastPosRef = useRef(0);

  const axisPos = (e: { clientX: number; clientY: number }): number =>
    orientation === "vertical" ? e.clientX : e.clientY;

  const handlePointerDown = (e: ReactPointerEvent<HTMLHRElement>): void => {
    draggingRef.current = true;
    lastPosRef.current = axisPos(e);
    if (typeof e.currentTarget.setPointerCapture === "function") {
      e.currentTarget.setPointerCapture(e.pointerId);
    }
  };

  const handlePointerMove = (e: ReactPointerEvent<HTMLHRElement>): void => {
    if (!draggingRef.current) return;
    const pos = axisPos(e);
    const delta = pos - lastPosRef.current;
    lastPosRef.current = pos;
    if (delta !== 0) onDelta(delta);
  };

  const endDrag = (e: ReactPointerEvent<HTMLHRElement>): void => {
    draggingRef.current = false;
    if (
      typeof e.currentTarget.hasPointerCapture === "function" &&
      typeof e.currentTarget.releasePointerCapture === "function" &&
      e.currentTarget.hasPointerCapture(e.pointerId)
    ) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
  };

  const handleKeyDown = (e: ReactKeyboardEvent<HTMLHRElement>): void => {
    const delta = arrowKeyDelta(orientation, e.key);
    if (delta === null) return;
    e.preventDefault();
    onDelta(delta);
  };

  return (
    <hr
      className={`splitter splitter--${orientation}${className ? ` ${className}` : ""}`}
      aria-orientation={orientation}
      aria-label={label}
      tabIndex={0}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onKeyDown={handleKeyDown}
    />
  );
}
