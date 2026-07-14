import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { UniformSpec } from "../../core/graph/uniformParser";
import { UniformControl } from "./UniformControl";

afterEach(() => {
  cleanup();
});

function makeSpec(overrides: Partial<UniformSpec>): UniformSpec {
  return {
    name: "u_test",
    type: "float",
    control: "slider",
    system: false,
    min: 0,
    max: 2,
    step: 0.01,
    defaultValue: 1,
    ...overrides,
  };
}

describe("UniformControl", () => {
  describe("slider", () => {
    it("renders one range input and one number input", () => {
      const { container } = render(
        <UniformControl
          spec={makeSpec({ control: "slider" })}
          value={0.5}
          onChange={() => {}}
        />,
      );
      expect(container.querySelectorAll("input[type='range']")).toHaveLength(1);
      expect(container.querySelectorAll("input[type='number']")).toHaveLength(
        1,
      );
    });

    it("wires the range input's change to onChange as a number", () => {
      let received: number | number[] | undefined;
      render(
        <UniformControl
          spec={makeSpec({ control: "slider" })}
          value={0.5}
          onChange={(v) => {
            received = v;
          }}
        />,
      );
      fireEvent.change(screen.getByRole("slider"), {
        target: { value: "1.75" },
      });
      expect(received).toBe(1.75);
    });

    it("falls back to spec.defaultValue when value is undefined", () => {
      render(
        <UniformControl
          spec={makeSpec({ control: "slider", defaultValue: 1.5 })}
          value={undefined}
          onChange={() => {}}
        />,
      );
      const numberInput = screen.getByRole("spinbutton") as HTMLInputElement;
      expect(numberInput.value).toBe("1.500");
    });
  });

  describe("multi", () => {
    it("renders 3 range inputs for a vec3", () => {
      const { container } = render(
        <UniformControl
          spec={makeSpec({
            control: "multi",
            type: "vec3",
            defaultValue: [0, 0, 0],
          })}
          value={[0.1, 0.2, 0.3]}
          onChange={() => {}}
        />,
      );
      expect(container.querySelectorAll("input[type='range']")).toHaveLength(3);
    });

    it("falls back to spec.defaultValue array when value is undefined", () => {
      const { container } = render(
        <UniformControl
          spec={makeSpec({
            control: "multi",
            type: "vec3",
            defaultValue: [0.4, 0.5, 0.6],
          })}
          value={undefined}
          onChange={() => {}}
        />,
      );
      const ranges = container.querySelectorAll(
        "input[type='range']",
      ) as NodeListOf<HTMLInputElement>;
      expect(Array.from(ranges).map((r) => r.value)).toEqual([
        "0.4",
        "0.5",
        "0.6",
      ]);
    });
  });

  describe("color", () => {
    it("renders a native color input", () => {
      const { container } = render(
        <UniformControl
          spec={makeSpec({
            control: "color",
            type: "vec3",
            defaultValue: [0, 0, 0],
          })}
          value={[1, 0, 0]}
          onChange={() => {}}
        />,
      );
      expect(container.querySelectorAll("input[type='color']")).toHaveLength(1);
    });

    it("falls back to spec.defaultValue array when value is undefined", () => {
      const { container } = render(
        <UniformControl
          spec={makeSpec({
            control: "color",
            type: "vec3",
            defaultValue: [0, 1, 0],
          })}
          value={undefined}
          onChange={() => {}}
        />,
      );
      const input = container.querySelector(
        "input[type='color']",
      ) as HTMLInputElement;
      expect(input.value).toBe("#00ff00");
    });
  });

  describe("bool", () => {
    it("renders a role=switch toggle", () => {
      render(
        <UniformControl
          spec={makeSpec({ control: "bool", defaultValue: 0 })}
          value={0}
          onChange={() => {}}
        />,
      );
      expect(screen.getByRole("switch")).not.toBeNull();
    });

    it("clicking the toggle calls onChange(1) when unchecked", () => {
      let received: number | number[] | undefined;
      render(
        <UniformControl
          spec={makeSpec({ control: "bool", defaultValue: 0 })}
          value={0}
          onChange={(v) => {
            received = v;
          }}
        />,
      );
      fireEvent.click(screen.getByRole("switch"));
      expect(received).toBe(1);
    });

    it("clicking the toggle calls onChange(0) when checked", () => {
      let received: number | number[] | undefined;
      render(
        <UniformControl
          spec={makeSpec({ control: "bool", defaultValue: 0 })}
          value={1}
          onChange={(v) => {
            received = v;
          }}
        />,
      );
      fireEvent.click(screen.getByRole("switch"));
      expect(received).toBe(0);
    });
  });

  describe("sampler / matrix", () => {
    it("renders nothing for sampler", () => {
      const { container } = render(
        <UniformControl
          spec={makeSpec({ control: "sampler", type: "sampler2D" })}
          value={undefined}
          onChange={() => {}}
        />,
      );
      expect(container.firstChild).toBeNull();
    });

    it("renders nothing for matrix", () => {
      const { container } = render(
        <UniformControl
          spec={makeSpec({ control: "matrix", type: "mat4" })}
          value={undefined}
          onChange={() => {}}
        />,
      );
      expect(container.firstChild).toBeNull();
    });
  });
});
