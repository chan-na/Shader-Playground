import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { GraphNode, MeshGraphNode } from "../core/graph/types";
import { CHAIN_DEMO_PARENTS } from "../state/demoGraph";
import { useGraphStore } from "../state/graphStore";
import { useHistoryStore } from "../state/historyStore";
import { WelcomeOverlay } from "./WelcomeOverlay";

function isMesh(n: GraphNode): n is MeshGraphNode {
  return n.kind === "mesh";
}

beforeEach(() => {
  // Same reset order as AppToolbar.test.tsx: reset() itself pushes the
  // pre-reset state onto history, so clear() must run after it.
  useGraphStore.getState().reset();
  useHistoryStore.getState().clear();
});

afterEach(() => {
  cleanup();
});

describe("WelcomeOverlay", () => {
  it("renders the eyebrow, title, and all four starter cards", () => {
    render(<WelcomeOverlay />);
    expect(screen.getByText("Welcome to ShaderPlayground")).not.toBeNull();
    expect(
      screen.getByText("Start from a template, or wire up nodes from scratch."),
    ).not.toBeNull();
    expect(screen.getByTestId("welcome-card-sphere").textContent).toContain(
      "Sphere",
    );
    expect(screen.getByTestId("welcome-card-torus").textContent).toContain(
      "Torus UV",
    );
    expect(screen.getByTestId("welcome-card-chain").textContent).toContain(
      "Chain",
    );
    expect(screen.getByTestId("welcome-card-particle").textContent).toContain(
      "Particle field",
    );
  });

  it("selects Sphere by default: check badge on its card, Create button labeled for it", () => {
    render(<WelcomeOverlay />);
    const sphereCard = screen.getByTestId("welcome-card-sphere");
    expect(sphereCard.className).toContain("welcome-card--selected");
    expect(sphereCard.querySelector(".welcome-card-check")).not.toBeNull();
    expect(screen.getByTestId("welcome-create-button").textContent).toContain(
      "Create Sphere",
    );
  });

  it("clicking another card moves the selection and updates the Create label", () => {
    render(<WelcomeOverlay />);
    fireEvent.click(screen.getByTestId("welcome-card-chain"));

    expect(screen.getByTestId("welcome-card-chain").className).toContain(
      "welcome-card--selected",
    );
    expect(screen.getByTestId("welcome-card-sphere").className).not.toContain(
      "welcome-card--selected",
    );
    expect(screen.getByTestId("welcome-create-button").textContent).toContain(
      "Create Chain",
    );
  });

  it("Create loads the selected demo graph via the real factory", () => {
    render(<WelcomeOverlay />);
    fireEvent.click(screen.getByTestId("welcome-card-particle"));
    fireEvent.click(screen.getByTestId("welcome-create-button"));

    const nodes = useGraphStore.getState().nodes;
    expect(nodes.length).toBeGreaterThan(0);
    expect(nodes.some((n) => n.id === "compute1" && n.kind === "compute")).toBe(
      true,
    );
  });

  it("Create also installs the demo's lesson-group parents map (F-2)", () => {
    render(<WelcomeOverlay />);
    fireEvent.click(screen.getByTestId("welcome-card-chain"));
    fireEvent.click(screen.getByTestId("welcome-create-button"));

    // Guard against a vacuous assertion: the map has to be non-empty for the
    // comparison below to distinguish "forwarded" from "defaulted to {}".
    expect(Object.keys(CHAIN_DEMO_PARENTS).length).toBeGreaterThan(0);
    // Without it the demo's group boxes stay empty and every child — whose
    // layout coordinates are group-relative — collapses onto the origin.
    expect(useGraphStore.getState().parents).toEqual(CHAIN_DEMO_PARENTS);
  });

  it("the node-count chip counts functional nodes only, not F-2's lesson groups", () => {
    render(<WelcomeOverlay />);
    const chipOf = (key: string): string =>
      screen
        .getByTestId(`welcome-card-${key}`)
        .querySelector(".welcome-card-chip")?.textContent ?? "";

    // Sphere/Torus wrap 3 functional nodes in 3 groups, Chain 4 in 3,
    // Particle 3 in 2 — a raw nodes.length would read 6/6/7/5 and contradict
    // the Sphere card's own copy ("three nodes end to end").
    expect(chipOf("sphere")).toBe("3 nodes");
    expect(chipOf("torus")).toBe("3 nodes");
    expect(chipOf("chain")).toBe("4 nodes");
    expect(chipOf("particle")).toBe("3 nodes");
  });

  it('"Start blank" dismisses the overlay for the GraphEmptyState onboarding, graph stays empty', () => {
    render(<WelcomeOverlay />);
    fireEvent.click(screen.getByTestId("welcome-blank-button"));

    expect(screen.queryByTestId("welcome-overlay")).toBeNull();
    expect(screen.getByTestId("graph-empty-state")).not.toBeNull();
    expect(useGraphStore.getState().nodes.length).toBe(0);
  });

  it('GraphEmptyState "Load a preset" returns to the Welcome starter grid', () => {
    render(<WelcomeOverlay />);
    fireEvent.click(screen.getByTestId("welcome-blank-button"));
    fireEvent.click(screen.getByTestId("graph-empty-load-preset"));

    expect(screen.queryByTestId("graph-empty-state")).toBeNull();
    expect(screen.getByTestId("welcome-overlay")).not.toBeNull();
  });

  it("Enter while nothing is focused (activeElement=body) triggers Create for the selected card", () => {
    render(<WelcomeOverlay />);
    fireEvent.click(screen.getByTestId("welcome-card-torus"));
    expect(document.activeElement).toBe(document.body);

    fireEvent.keyDown(window, { key: "Enter" });

    const nodes = useGraphStore.getState().nodes;
    const mesh = nodes.find(isMesh);
    expect(mesh?.primitive).toBe("torus");
  });

  it("Enter still creates the selected starter when a welcome card has focus (B2)", () => {
    render(<WelcomeOverlay />);
    fireEvent.click(screen.getByTestId("welcome-card-torus"));
    // jsdom doesn't move focus on a plain click() the way a real browser
    // does for a <button>, so focus it explicitly to reproduce the
    // post-click state the browser leaves us in (B2's actual bug trigger).
    (screen.getByTestId("welcome-card-torus") as HTMLButtonElement).focus();
    expect(document.activeElement).toBe(
      screen.getByTestId("welcome-card-torus"),
    );

    fireEvent.keyDown(window, { key: "Enter" });

    const nodes = useGraphStore.getState().nodes;
    const mesh = nodes.find(isMesh);
    expect(mesh?.primitive).toBe("torus");
  });

  it("Enter is still ignored while an unrelated element has focus", () => {
    render(<WelcomeOverlay />);
    const link = screen.getByRole("button", { name: "Browse all presets" });
    link.focus();
    expect(document.activeElement).toBe(link);

    fireEvent.keyDown(window, { key: "Enter" });

    expect(useGraphStore.getState().nodes.length).toBe(0);
  });
});
