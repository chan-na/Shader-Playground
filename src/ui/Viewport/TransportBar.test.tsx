import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { useCameraStore } from "../../state/cameraStore";
import { useTimeStore } from "../../state/timeStore";
import { TransportBar } from "./TransportBar";

const initialTime = useTimeStore.getState();
const initialCamera = useCameraStore.getState();

afterEach(() => {
  useTimeStore.setState(initialTime, true);
  useCameraStore.setState(initialCamera, true);
  cleanup();
});

describe("TransportBar", () => {
  it("exposes the time-playpause/time-scrub/time-speed/camera-fov testid hooks", () => {
    render(<TransportBar />);
    expect(screen.getByTestId("time-playpause")).not.toBeNull();
    expect(screen.getByTestId("time-scrub")).not.toBeNull();
    expect(screen.getByTestId("time-speed")).not.toBeNull();
    expect(screen.getByTestId("camera-fov")).not.toBeNull();
  });

  it("renders the pause glyph at the initial playing=true state", () => {
    render(<TransportBar />);
    expect(screen.getByTestId("time-playpause").textContent).toBe("‖");
  });

  it("formats the time label as 0.00s and the FOV label in degrees", () => {
    render(<TransportBar />);
    expect(screen.getByText("0.00s")).not.toBeNull();
    const fov = screen.getByTestId("camera-fov");
    const fovValue = fov.parentElement?.querySelector(
      ".vp-transport-fov-value",
    );
    expect(fovValue?.textContent).toMatch(/^\d+°$/);
  });

  it("formats the speed label as N×", () => {
    render(<TransportBar />);
    expect(screen.getByTestId("time-speed").textContent).toBe("1×");
  });

  it("labels the reset buttons with their tooltips", () => {
    render(<TransportBar />);
    expect(
      screen.getByRole("button", { name: /⏮/ }).getAttribute("title"),
    ).toBe("Reset time");
    expect(
      screen.getByRole("button", { name: /Reset/ }).getAttribute("title"),
    ).toBe("Reset camera");
  });

  it("cycles the speed button through SPEEDS on repeated clicks (1 → 2 → 4 → 0.25)", () => {
    render(<TransportBar />);
    const speedBtn = screen.getByTestId("time-speed");
    expect(useTimeStore.getState().speed).toBe(1);

    fireEvent.click(speedBtn);
    expect(useTimeStore.getState().speed).toBe(2);

    fireEvent.click(speedBtn);
    expect(useTimeStore.getState().speed).toBe(4);

    fireEvent.click(speedBtn);
    expect(useTimeStore.getState().speed).toBe(0.25);
  });

  it("toggles playing and swaps the glyph on click", () => {
    render(<TransportBar />);
    const playBtn = screen.getByTestId("time-playpause");
    fireEvent.click(playBtn);
    expect(useTimeStore.getState().playing).toBe(false);
    expect(playBtn.textContent).toBe("▶");
  });

  it("resets simTime to 0 when the reset-time button is clicked", () => {
    useTimeStore.setState({ simTime: 12.5 });
    render(<TransportBar />);
    fireEvent.click(screen.getByTitle("Reset time"));
    expect(useTimeStore.getState().simTime).toBe(0);
  });

  it("resets the camera to its default state when Reset is clicked", () => {
    useCameraStore.setState({
      camera: { ...initialCamera.camera, fov: Math.PI / 2 },
    });
    render(<TransportBar />);
    fireEvent.click(screen.getByTitle("Reset camera"));
    expect(useCameraStore.getState().camera.fov).toBe(initialCamera.camera.fov);
  });
});
