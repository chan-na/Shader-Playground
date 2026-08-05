import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { UniformHints, UniformSpec } from "../../core/graph/uniformParser";
import { UniformHintEditor } from "./UniformHintEditor";

afterEach(() => {
  cleanup();
});

function makeSpec(overrides: Partial<UniformSpec>): UniformSpec {
  return {
    name: "u_power",
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

function edit(testId: string, value: string) {
  fireEvent.change(screen.getByTestId(testId), { target: { value } });
}

// C-2: the Default field is pre-filled from `spec.defaultValue`, which for an
// unannotated uniform is `defaultRangeFor`'s name-based heuristic
// (`u_*color*` → white) rather than anything the author wrote. Since an
// emitted `@default` is now *bound* — `withExplicitDefaults` seeds it and
// `bindUserUniforms` uploads it every frame — re-emitting that guess turned
// adjusting a slider's range into a silent render change (u_tintColor: GL
// zero/black → white). Only a field the user touched, or a uniform that
// already carried an `@default`, may emit one.
describe("UniformHintEditor", () => {
  describe("@default emission", () => {
    it("omits defaultValue when only the range was edited on an unannotated uniform", () => {
      let applied: UniformHints | undefined;
      render(
        <UniformHintEditor
          spec={makeSpec({})}
          onApply={(hints) => {
            applied = hints;
          }}
          onClose={() => {}}
        />,
      );
      // The premise of this case: the field really is pre-filled with the
      // heuristic value, so "untouched" is not the same as "empty".
      expect(
        (screen.getByTestId("uniform-hint-default") as HTMLInputElement).value,
      ).toBe("1");

      edit("uniform-hint-min", "1");
      edit("uniform-hint-max", "8");
      fireEvent.click(screen.getByTestId("uniform-hint-apply"));

      expect(applied).toEqual({ min: 1, max: 8, step: 0.01 });
    });

    it("emits defaultValue once the Default field itself is edited", () => {
      let applied: UniformHints | undefined;
      render(
        <UniformHintEditor
          spec={makeSpec({})}
          onApply={(hints) => {
            applied = hints;
          }}
          onClose={() => {}}
        />,
      );
      edit("uniform-hint-default", "0.25");
      fireEvent.click(screen.getByTestId("uniform-hint-apply"));

      expect(applied).toEqual({
        min: 0,
        max: 2,
        step: 0.01,
        defaultValue: 0.25,
      });
    });

    // `writeUniformHints` re-emits the whole managed annotation block, so
    // dropping defaultValue here would *delete* the author's `@default`.
    it("keeps an already-annotated uniform's defaultValue even when untouched", () => {
      let applied: UniformHints | undefined;
      render(
        <UniformHintEditor
          spec={makeSpec({ hasExplicitDefault: true })}
          onApply={(hints) => {
            applied = hints;
          }}
          onClose={() => {}}
        />,
      );
      edit("uniform-hint-max", "8");
      fireEvent.click(screen.getByTestId("uniform-hint-apply"));

      expect(applied).toEqual({ min: 0, max: 8, step: 0.01, defaultValue: 1 });
    });

    it("omits defaultValue when only the range was edited on an unannotated color", () => {
      let applied: UniformHints | undefined;
      render(
        <UniformHintEditor
          spec={makeSpec({
            name: "u_tintColor",
            type: "vec3",
            control: "color",
            min: 0,
            max: 1,
            // What `defaultRangeFor` guesses for a color-named uniform — the
            // white this fix must stop binding.
            defaultValue: [1, 1, 1],
          })}
          onApply={(hints) => {
            applied = hints;
          }}
          onClose={() => {}}
        />,
      );
      edit("uniform-hint-max", "0.5");
      fireEvent.click(screen.getByTestId("uniform-hint-apply"));

      expect(applied).toEqual({
        min: 0,
        max: 0.5,
        step: 0.01,
        control: "color",
      });
    });

    it("emits the parsed vector once the color's Default field is edited", () => {
      let applied: UniformHints | undefined;
      render(
        <UniformHintEditor
          spec={makeSpec({
            name: "u_tintColor",
            type: "vec3",
            control: "color",
            min: 0,
            max: 1,
            defaultValue: [1, 1, 1],
          })}
          onApply={(hints) => {
            applied = hints;
          }}
          onClose={() => {}}
        />,
      );
      edit("uniform-hint-default", "0.2, 0.4, 0.6");
      fireEvent.click(screen.getByTestId("uniform-hint-apply"));

      expect(applied).toEqual({
        min: 0,
        max: 1,
        step: 0.01,
        defaultValue: [0.2, 0.4, 0.6],
        control: "color",
      });
    });
  });
});
