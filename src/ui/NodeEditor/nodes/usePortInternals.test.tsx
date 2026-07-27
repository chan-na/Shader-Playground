import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const updateNodeInternals = vi.fn();

// The hook's only React Flow dependency is `useUpdateNodeInternals`, whose
// real implementation needs a live <ReactFlowProvider> store + DOM nodes.
// Mocking it keeps this test on the actual contract we care about: *when* the
// node is asked to re-register its handles.
vi.mock("@xyflow/react", () => ({
  useUpdateNodeInternals: () => updateNodeInternals,
}));

import type { PortSpec } from "../../../core/nodes/registry";
import { portSignature, usePortInternals } from "./usePortInternals";

const mesh: PortSpec = { name: "mesh", type: "mesh" };
const uA: PortSpec = { name: "u_a", type: "float" };
const uB: PortSpec = { name: "u_b", type: "float" };

describe("portSignature", () => {
  it("is stable across distinct arrays with the same ports", () => {
    expect(portSignature([mesh, uA])).toBe(
      portSignature([{ ...mesh }, { ...uA }]),
    );
  });

  it("changes when a port is added", () => {
    expect(portSignature([mesh, uA])).not.toBe(portSignature([mesh, uA, uB]));
  });

  it("changes when ports are reordered — the slot index drives each port's y", () => {
    expect(portSignature([mesh, uA, uB])).not.toBe(
      portSignature([mesh, uB, uA]),
    );
  });

  it("changes when a port keeps its slot but changes type", () => {
    expect(portSignature([{ name: "u_a", type: "float" }])).not.toBe(
      portSignature([{ name: "u_a", type: "vec3" }]),
    );
  });
});

describe("usePortInternals", () => {
  beforeEach(() => {
    updateNodeInternals.mockClear();
  });

  it("does not re-register on mount — React Flow measures the node then", () => {
    renderHook(() => {
      usePortInternals("s1", [mesh, uA]);
    });
    expect(updateNodeInternals).not.toHaveBeenCalled();
  });

  it("re-registers when a uniform adds a port", () => {
    const { rerender } = renderHook(
      ({ ports }: { ports: PortSpec[] }) => {
        usePortInternals("s1", ports);
      },
      { initialProps: { ports: [mesh, uA] } },
    );
    rerender({ ports: [mesh, uA, uB] });
    expect(updateNodeInternals).toHaveBeenCalledTimes(1);
    expect(updateNodeInternals).toHaveBeenCalledWith("s1");
  });

  it("re-registers when a port is removed", () => {
    const { rerender } = renderHook(
      ({ ports }: { ports: PortSpec[] }) => {
        usePortInternals("s1", ports);
      },
      { initialProps: { ports: [mesh, uA, uB] } },
    );
    rerender({ ports: [mesh, uA] });
    expect(updateNodeInternals).toHaveBeenCalledTimes(1);
  });

  it("stays quiet when the same port set re-renders as a new array", () => {
    const { rerender } = renderHook(
      ({ ports }: { ports: PortSpec[] }) => {
        usePortInternals("s1", ports);
      },
      { initialProps: { ports: [mesh, uA] } },
    );
    rerender({ ports: [{ ...mesh }, { ...uA }] });
    expect(updateNodeInternals).not.toHaveBeenCalled();
  });
});
