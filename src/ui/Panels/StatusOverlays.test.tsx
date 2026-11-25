import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { useBootstrapStore } from "../../state/bootstrapStore";
import { useDebugUiStore } from "../../state/debugUiStore";
import { usePassPlanStore } from "../../state/passPlanStore";
import { resetAllStores } from "../../state/testStores";
import { StatusOverlays } from "./StatusOverlays";

function resetStores() {
  resetAllStores();
  // StatusOverlays gates its body on bootstrap phase, like SidePanel — tests
  // that don't care about the skeleton force it to "done".
  useBootstrapStore.setState({ phase: "done" });
}

beforeEach(resetStores);
afterEach(() => {
  cleanup();
  resetAllStores();
});

describe("StatusOverlays", () => {
  it("renders nothing when both overlays are closed", () => {
    render(<StatusOverlays />);

    expect(screen.queryByTestId("diagnostics-overlay")).toBeNull();
    expect(screen.queryByTestId("problems-overlay")).toBeNull();
  });

  it("shows the diagnostics overlay with its panel + header when open", () => {
    render(<StatusOverlays />);

    act(() => {
      useDebugUiStore.getState().setOpen(true);
    });

    expect(screen.getByTestId("diagnostics-overlay")).not.toBeNull();
    expect(screen.getByTestId("diagnostics-panel")).not.toBeNull();
    expect(screen.getByTestId("diagnostics-overlay").textContent).toContain(
      "◨ Diagnostics",
    );
  });

  it("shows the problems overlay with the empty-state message when problemsOpen", () => {
    render(<StatusOverlays />);

    act(() => {
      useDebugUiStore.getState().setProblemsOpen(true);
    });

    expect(screen.getByTestId("problems-overlay")).not.toBeNull();
    expect(screen.getByTestId("problems-overlay").textContent).toContain(
      "No problems",
    );
  });

  // passesOpen is the third mutually-exclusive slot (see debugUiStore.ts's
  // 3-way exclusion note).
  it("shows the passes overlay with the Pass Inspector when passesOpen", () => {
    render(<StatusOverlays />);

    act(() => {
      useDebugUiStore.getState().setPassesOpen(true);
    });

    expect(screen.getByTestId("passes-overlay")).not.toBeNull();
    expect(screen.getByTestId("passes-overlay").textContent).toContain(
      "▤ Passes",
    );
    // Empty-state text from PassInspector, standing in for "the table is
    // mounted here". Published with no rows on purpose: unpublished renders
    // the *other* empty state ("renderer not running"), which would make this
    // assertion pass for the wrong reason if the mount ever regressed.
    act(() => {
      usePassPlanStore.getState().publish([], {}, {});
    });
    expect(screen.getByTestId("passes-overlay").textContent).toContain(
      "no passes — compile a shader node first",
    );
  });

  it("never renders the metric strip in the passes overlay", () => {
    render(<StatusOverlays />);

    act(() => {
      useDebugUiStore.getState().setPassesOpen(true);
    });

    expect(screen.getByTestId("passes-overlay")).not.toBeNull();
    expect(screen.queryByTestId("diagnostics-metric-strip")).toBeNull();
  });

  it("shows the panel skeleton instead of the diagnostics panel while bootstrap isn't done", () => {
    useBootstrapStore.setState({ phase: "init" });
    render(<StatusOverlays />);

    act(() => {
      useDebugUiStore.getState().setOpen(true);
    });

    expect(screen.getByTestId("panel-skeleton")).not.toBeNull();
    expect(screen.queryByTestId("diagnostics-panel")).toBeNull();
  });

  it("closing via DiagnosticsPanel's close button dismisses the overlay (existing setOpen(false) wiring)", () => {
    render(<StatusOverlays />);

    act(() => {
      useDebugUiStore.getState().setOpen(true);
    });
    expect(screen.getByTestId("diagnostics-overlay")).not.toBeNull();

    fireEvent.click(screen.getByTestId("diagnostics-close"));

    expect(screen.queryByTestId("diagnostics-overlay")).toBeNull();
    expect(useDebugUiStore.getState().open).toBe(false);
  });

  // design/App Shell.dc.html "DIAGNOSTICS / PROBLEMS OVERLAY": diagnostics
  // gets the 26px metric strip; problems never gets the strip. There are no
  // metric cards, so there is no suppression to assert.
  it("shows the metric strip when diagnostics is open (T3)", () => {
    render(<StatusOverlays />);

    act(() => {
      useDebugUiStore.getState().setOpen(true);
    });

    expect(screen.getByTestId("diagnostics-metric-strip")).not.toBeNull();
  });

  it("never renders the metric strip in the problems overlay (T4)", () => {
    render(<StatusOverlays />);

    act(() => {
      useDebugUiStore.getState().setProblemsOpen(true);
    });

    expect(screen.getByTestId("problems-overlay")).not.toBeNull();
    expect(screen.queryByTestId("diagnostics-metric-strip")).toBeNull();
  });

  it("renders the metric strip alongside the panel skeleton while bootstrap isn't done (interim decision)", () => {
    useBootstrapStore.setState({ phase: "init" });
    render(<StatusOverlays />);

    act(() => {
      useDebugUiStore.getState().setOpen(true);
    });

    expect(screen.getByTestId("diagnostics-metric-strip")).not.toBeNull();
    expect(screen.getByTestId("panel-skeleton")).not.toBeNull();
  });
});
