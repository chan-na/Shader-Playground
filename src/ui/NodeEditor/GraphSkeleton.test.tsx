import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { GraphSkeleton } from "./GraphSkeleton";

afterEach(cleanup);

describe("GraphSkeleton", () => {
  it("renders the overlay with three node placeholder cards", () => {
    render(<GraphSkeleton />);

    const overlay = screen.getByTestId("graph-skeleton");
    expect(overlay.querySelectorAll(".graph-skeleton-card")).toHaveLength(3);
  });

  it("shows the 'Restoring graph…' label", () => {
    render(<GraphSkeleton />);

    expect(screen.getByText("Restoring graph…")).not.toBeNull();
  });
});
