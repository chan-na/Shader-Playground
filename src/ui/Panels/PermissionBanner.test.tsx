import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PermissionBanner } from "./PermissionBanner";

afterEach(() => {
  cleanup();
});

describe("PermissionBanner — pending", () => {
  it("renders the camera-awaiting copy and no retry button", () => {
    render(
      <PermissionBanner device="camera" state="pending" onRetry={() => {}} />,
    );
    const banner = screen.getByTestId("permission-banner");
    expect(banner.dataset.state).toBe("pending");
    expect(banner.textContent).toContain("Awaiting camera permission");
    expect(screen.queryByTestId("permission-retry")).toBeNull();
  });

  it("renders the microphone-awaiting copy when device is 'microphone'", () => {
    render(
      <PermissionBanner
        device="microphone"
        state="pending"
        onRetry={() => {}}
      />,
    );
    expect(screen.getByTestId("permission-banner").textContent).toContain(
      "Awaiting microphone permission",
    );
  });
});

describe("PermissionBanner — denied", () => {
  it("renders the blocked copy, an 'Enable camera' retry button, and the site-settings caption", () => {
    const onRetry = vi.fn();
    render(
      <PermissionBanner device="camera" state="denied" onRetry={onRetry} />,
    );
    const banner = screen.getByTestId("permission-banner");
    expect(banner.dataset.state).toBe("denied");
    expect(banner.textContent).toContain("Camera access was blocked");
    expect(banner.textContent).toContain("manage in browser site settings");

    const retryButton = screen.getByTestId("permission-retry");
    expect(retryButton.textContent).toBe("Enable camera");
    fireEvent.click(retryButton);
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it("renders 'Enable microphone' as the retry label for device='microphone'", () => {
    render(
      <PermissionBanner
        device="microphone"
        state="denied"
        onRetry={() => {}}
      />,
    );
    expect(screen.getByTestId("permission-retry").textContent).toBe(
      "Enable microphone",
    );
    expect(screen.getByTestId("permission-banner").textContent).toContain(
      "Microphone access was blocked",
    );
  });
});
