import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { GraphNode, MeshGraphNode } from "../core/graph/types";
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

  it('"Start blank" dismisses the overlay and leaves the graph empty', () => {
    render(<WelcomeOverlay />);
    fireEvent.click(screen.getByTestId("welcome-blank-button"));

    expect(screen.queryByTestId("welcome-overlay")).toBeNull();
    expect(useGraphStore.getState().nodes.length).toBe(0);
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
});
