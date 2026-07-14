import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { PanelSkeleton } from "./PanelSkeleton";

afterEach(cleanup);

describe("PanelSkeleton", () => {
  it("renders four label+field rows", () => {
    render(<PanelSkeleton />);

    const root = screen.getByTestId("panel-skeleton");
    expect(root.querySelectorAll(".panel-skeleton-row")).toHaveLength(4);
    expect(root.querySelectorAll(".panel-skeleton-label")).toHaveLength(4);
    expect(root.querySelectorAll(".panel-skeleton-field")).toHaveLength(4);
  });
});
