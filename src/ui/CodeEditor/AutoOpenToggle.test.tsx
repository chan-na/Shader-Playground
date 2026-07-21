import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { useEditorStore } from "../../state/editorStore";
import { AutoOpenToggle } from "./AutoOpenToggle";

const TITLE_ON =
  "Auto-open Code is ON — selecting a Shader node opens this panel, " +
  "selecting others collapses it. Click to switch to manual.";
const TITLE_OFF =
  "Auto-open Code is OFF — the panel only opens/closes when you toggle it. " +
  "Click to let node selection open it automatically.";

beforeEach(() => {
  useEditorStore.setState({ autoCode: true });
});

afterEach(() => {
  cleanup();
});

describe("AutoOpenToggle", () => {
  it("renders ON by default with the --on class and data-auto=true", () => {
    render(<AutoOpenToggle />);
    const toggle = screen.getByTestId("code-auto-open-toggle");
    expect(toggle.textContent).toBe("Auto: ON");
    expect(toggle.getAttribute("data-auto")).toBe("true");
    expect(toggle.className).toContain("code-auto-toggle--on");
  });

  it("clicking turns it OFF: store false, label OFF, data-auto false, --on class removed", () => {
    render(<AutoOpenToggle />);
    const toggle = screen.getByTestId("code-auto-open-toggle");
    fireEvent.click(toggle);
    expect(useEditorStore.getState().autoCode).toBe(false);
    expect(toggle.textContent).toBe("Auto: OFF");
    expect(toggle.getAttribute("data-auto")).toBe("false");
    expect(toggle.className).not.toContain("code-auto-toggle--on");
  });

  it("clicking again restores ON", () => {
    render(<AutoOpenToggle />);
    const toggle = screen.getByTestId("code-auto-open-toggle");
    fireEvent.click(toggle);
    fireEvent.click(toggle);
    expect(useEditorStore.getState().autoCode).toBe(true);
    expect(toggle.textContent).toBe("Auto: ON");
    expect(toggle.getAttribute("data-auto")).toBe("true");
    expect(toggle.className).toContain("code-auto-toggle--on");
  });

  it("label text is wrapped in .code-auto-toggle-label (X2 ellipsis carrier)", () => {
    render(<AutoOpenToggle />);
    const toggle = screen.getByTestId("code-auto-open-toggle");
    const label = toggle.querySelector(".code-auto-toggle-label");
    expect(label).not.toBeNull();
    expect(label?.textContent).toBe("Auto: ON");
  });

  it("title matches the dc ON/OFF copy exactly", () => {
    render(<AutoOpenToggle />);
    const toggle = screen.getByTestId("code-auto-open-toggle");
    expect(toggle.getAttribute("title")).toBe(TITLE_ON);
    fireEvent.click(toggle);
    expect(toggle.getAttribute("title")).toBe(TITLE_OFF);
  });
});
