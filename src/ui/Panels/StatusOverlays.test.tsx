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
import { StatusOverlays } from "./StatusOverlays";

const initialDebugUi = useDebugUiStore.getState();
const initialBootstrap = useBootstrapStore.getState();

function resetStores() {
  useDebugUiStore.setState(initialDebugUi, true);
  // StatusOverlays gates its body on bootstrap phase (SidePanel L96-97
  // precedent) — tests that don't care about the skeleton force "done"
  // since the store is a module singleton.
  useBootstrapStore.setState({ ...initialBootstrap, phase: "done" }, true);
}

beforeEach(resetStores);
afterEach(() => {
  cleanup();
  useBootstrapStore.setState(initialBootstrap, true);
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

  it("shows the panel skeleton instead of the diagnostics panel while bootstrap isn't done", () => {
    useBootstrapStore.setState({ ...initialBootstrap, phase: "init" });
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

  // T3/T4 (§v1.6, design/App Shell.dc.html L403-433): diagnostics gets the
  // 26px metric strip; problems never gets the strip. (X12 §v2.1 removed the
  // 2x2 metric cards entirely, so there is no longer a suppression to assert.)
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
    useBootstrapStore.setState({ ...initialBootstrap, phase: "init" });
    render(<StatusOverlays />);

    act(() => {
      useDebugUiStore.getState().setOpen(true);
    });

    expect(screen.getByTestId("diagnostics-metric-strip")).not.toBeNull();
    expect(screen.getByTestId("panel-skeleton")).not.toBeNull();
  });
});
