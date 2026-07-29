import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { useGraphStore } from "../state/graphStore";
import { useSelectionStore } from "../state/selectionStore";
import { useTimeStore } from "../state/timeStore";
import { KeyboardShortcuts } from "./KeyboardShortcuts";

/**
 * 전역 단축키의 Space 스코프 회귀 가드(2026-07 리뷰 #15). 이 컴포넌트는
 * `window`에 keydown 리스너 하나만 걸고 아무것도 렌더하지 않으므로, 테스트는
 * "어떤 엘리먼트를 타깃으로 keydown을 쏘면 스토어가 어떻게 되는가"만 본다.
 */

const timeInitial = useTimeStore.getState();

beforeEach(() => {
  useTimeStore.setState({ ...timeInitial, playing: true }, true);
  useSelectionStore.getState().select(null);
});

afterEach(() => {
  cleanup();
});

/** 단축키 리스너를 마운트하고 지정한 마크업을 함께 렌더한다. */
function mount(ui?: ReactNode) {
  render(
    <>
      <KeyboardShortcuts />
      {ui}
    </>,
  );
}

/** ARIA role만 다른 포커스 가능한 컨테이너 — role을 변수로 받아 각 케이스가
 * 같은 마크업을 공유한다. */
function RoleBox({ role }: { role: string }) {
  return (
    <div role={role} tabIndex={0} data-testid="target">
      target
    </div>
  );
}

describe("KeyboardShortcuts — Space", () => {
  it("toggles playback when the event target is plain page chrome (document.body)", () => {
    mount();
    expect(useTimeStore.getState().playing).toBe(true);

    fireEvent.keyDown(document.body, { key: " " });

    expect(useTimeStore.getState().playing).toBe(false);
  });

  it("leaves playback alone when a <button> has focus — Space must press the button instead", () => {
    mount(
      <button type="button" data-testid="target">
        Close panel
      </button>,
    );

    fireEvent.keyDown(screen.getByTestId("target"), { key: " " });

    expect(useTimeStore.getState().playing).toBe(true);
  });

  it("also skips when the target is an element *inside* an activatable control", () => {
    mount(
      <button type="button">
        <span data-testid="target">✕</span>
      </button>,
    );

    fireEvent.keyDown(screen.getByTestId("target"), { key: " " });

    expect(useTimeStore.getState().playing).toBe(true);
  });

  it("leaves playback alone on a link", () => {
    mount(
      <a href="#docs" data-testid="target">
        Docs
      </a>,
    );

    fireEvent.keyDown(screen.getByTestId("target"), { key: " " });

    expect(useTimeStore.getState().playing).toBe(true);
  });

  it.each([
    ["button"],
    ["tab"],
    ["menuitem"],
  ])('leaves playback alone for role="%s"', (role) => {
    mount(<RoleBox role={role} />);

    fireEvent.keyDown(screen.getByTestId("target"), { key: " " });

    expect(useTimeStore.getState().playing).toBe(true);
  });

  it.each([
    ["group"],
    ["application"],
  ])('still toggles over role="%s" — React Flow marks nodes/pane with these, so the canvas shortcut must survive', (role) => {
    mount(<RoleBox role={role} />);

    fireEvent.keyDown(screen.getByTestId("target"), { key: " " });

    expect(useTimeStore.getState().playing).toBe(false);
  });

  it("still skips text inputs (pre-existing guard is unchanged)", () => {
    mount(<input aria-label="name" data-testid="target" />);

    fireEvent.keyDown(screen.getByTestId("target"), { key: " " });

    expect(useTimeStore.getState().playing).toBe(true);
  });
});

describe("KeyboardShortcuts — arrow nudge is NOT scoped to non-buttons", () => {
  it("nudges the selection even while a button has focus", () => {
    useGraphStore.setState({ positions: { n1: { x: 10, y: 20 } } });
    useSelectionStore.getState().setSelectedIds(["n1"]);
    mount(
      <button type="button" data-testid="target">
        Maximize panel
      </button>,
    );

    fireEvent.keyDown(screen.getByTestId("target"), { key: "ArrowRight" });

    expect(useGraphStore.getState().positions.n1).toEqual({ x: 20, y: 20 });
  });
});
