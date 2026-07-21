import { describe, expect, it } from "vitest";
import { cssVars, PORT_DIAMETER, tokens, withAlpha } from "./theme";

/**
 * cssVars()의 kebab-case 변환 규칙을 테스트에서 독립적으로 재현한다.
 * (src/theme.ts의 내부 kebab()을 그대로 import하지 않음 — 구현이 바뀌어도
 * 이 테스트가 "같은 실수"를 함께 반복하지 않도록 방지하기 위함.)
 */
function kebab(s: string): string {
  return s.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`);
}

/** 색 그룹(hex 값 객체) → CSS 변수 프리픽스 매핑 */
const colorGroups: Array<{
  name: string;
  prefix: string;
  values: Record<string, string>;
}> = [
  { name: "border", prefix: "--border-", values: tokens.border },
  { name: "accent", prefix: "--accent-", values: tokens.accent },
  { name: "text", prefix: "--text-", values: tokens.text },
  { name: "semantic", prefix: "--", values: tokens.semantic },
  {
    name: "nodeCategory",
    prefix: "--node-cat-",
    values: tokens.nodeCategory,
  },
  { name: "portFamily", prefix: "--port-", values: tokens.portFamily },
];

describe("cssVars", () => {
  const css = cssVars();
  const lines = css.split("\n");

  it("surface/border 그룹의 kebab-case 변환이 정확하다", () => {
    expect(css).toContain(`--surface-app-darker: ${tokens.surface.appDarker};`);
    expect(css).toContain(
      `--border-header-divider: ${tokens.border.headerDivider};`,
    );
  });

  it("surface 그룹의 모든 키가 --surface-<kebab> 변수로 방출된다", () => {
    for (const [k, v] of Object.entries(tokens.surface)) {
      expect(css).toContain(`--surface-${kebab(k)}: ${v};`);
    }
  });

  it("gradient 그룹이 --gradient-<kebab> 변수로 방출된다", () => {
    expect(css).toContain(
      `--gradient-empty-state: ${tokens.gradient.emptyState};`,
    );
    for (const [k, v] of Object.entries(tokens.gradient)) {
      expect(css).toContain(`--gradient-${kebab(k)}: ${v};`);
    }
  });

  it.each(
    colorGroups,
  )("$name 그룹의 모든 키가 $prefix<kebab> 변수로 방출된다", ({
    prefix,
    values,
  }) => {
    for (const [k, v] of Object.entries(values)) {
      expect(css).toContain(`${prefix}${kebab(k)}: ${v};`);
    }
  });

  it("font 그룹이 --font-ui / --font-mono로 방출된다", () => {
    expect(css).toContain(`--font-ui: ${tokens.font.ui};`);
    expect(css).toContain(`--font-mono: ${tokens.font.mono};`);
  });

  it("radius 그룹이 px 단위를 붙여 --radius-<kebab> 변수로 방출된다", () => {
    for (const [k, v] of Object.entries(tokens.radius)) {
      expect(css).toContain(`--radius-${kebab(k)}: ${v}px;`);
    }
    expect(css).toContain(`--radius-node-card: ${tokens.radius.nodeCard}px;`);
    expect(css).toContain(
      `--radius-transport-bar: ${tokens.radius.transportBar}px;`,
    );
    expect(css).toContain(
      `--radius-empty-state-icon: ${tokens.radius.emptyStateIcon}px;`,
    );
    expect(css).toContain(`--radius-modal: ${tokens.radius.modal}px;`);
  });

  it("shadow 그룹은 문자열 값만 --shadow-<kebab>로 방출하고 함수(portOutputGlow)는 제외한다", () => {
    expect(css).toContain(`--shadow-select-ring: ${tokens.shadow.selectRing};`);
    expect(css).toContain(`--shadow-node-card: ${tokens.shadow.nodeCard};`);
    expect(css).toContain(
      `--shadow-node-card-hero: ${tokens.shadow.nodeCardHero};`,
    );
    expect(css).toContain(`--shadow-error-ring: ${tokens.shadow.errorRing};`);
    expect(css).toContain(`--shadow-warn-ring: ${tokens.shadow.warnRing};`);
    expect(css).toContain(
      `--shadow-on-canvas-text: ${tokens.shadow.onCanvasText};`,
    );
    expect(css).toContain(`--shadow-overlay-bar: ${tokens.shadow.overlayBar};`);
    expect(css).toContain(`--shadow-modal: ${tokens.shadow.modal};`);
    expect(css).not.toContain("--shadow-port-output-glow");
  });

  it("motion 그룹이 duration/easing 변수로 방출된다", () => {
    expect(css).toContain(
      `--motion-duration-min: ${tokens.motion.durationMs.min}ms;`,
    );
    expect(css).toContain(
      `--motion-duration-max: ${tokens.motion.durationMs.max}ms;`,
    );
    expect(css).toContain(`--motion-easing: ${tokens.motion.easing};`);
  });

  it("모든 라인이 `--키: 값;` 형식을 따른다 (함수 직렬화 유출 방지)", () => {
    expect(lines.length).toBeGreaterThan(0);
    for (const line of lines) {
      expect(line).toMatch(/^--[a-z0-9-]+: .+;$/);
    }
  });
});

describe("PORT_DIAMETER", () => {
  it("card 지름의 절반이 포트 중심 y 규칙의 오프셋(5.5)과 일치한다", () => {
    expect(PORT_DIAMETER.card / 2).toBe(5.5);
  });

  it("hero 지름이 card 지름보다 크다", () => {
    expect(PORT_DIAMETER.hero).toBeGreaterThan(PORT_DIAMETER.card);
  });
});

describe("portTypeToFamily", () => {
  it("모든 매핑 값이 portFamily의 유효한 키를 참조한다", () => {
    const familyKeys = Object.keys(tokens.portFamily);
    for (const family of Object.values(tokens.portTypeToFamily)) {
      expect(familyKeys).toContain(family);
    }
  });
});

describe("색 토큰 hex 형식", () => {
  it.each(colorGroups)("$name 그룹의 모든 값이 6자리 hex다", ({ values }) => {
    for (const v of Object.values(values)) {
      expect(v).toMatch(/^#[0-9a-f]{6}$/);
    }
  });
});

describe("overlay 토큰", () => {
  it("gridDot이 화이트 채널 rgba(255,255,255,0.045)와 일치한다", () => {
    expect(tokens.overlay.gridDot).toMatch(
      /^rgba\(255,\s*255,\s*255,\s*0?\.045\)$/,
    );
  });

  it("scrim이 블랙 채널 rgba(0,0,0,0.5)와 일치한다", () => {
    expect(tokens.overlay.scrim).toMatch(/^rgba\(0,\s*0,\s*0,\s*0?\.5\)$/);
  });
});

describe("S26 신규 토큰 (v2.0)", () => {
  it("6종 신규 토큰이 design/theme.ts 정본 값으로 고정된다", () => {
    expect(tokens.accent.bright).toBe("#7dbcff");
    expect(tokens.semantic.successBright).toBe("#6fe3b8");
    expect(tokens.nodeCategory.processBright).toBe("#7dbcff");
    expect(tokens.nodeCategory.valueBright).toBe("#e2ba57");
    expect(tokens.nodeCategory.outputBright).toBe("#ee7fac");
  });

  it("processBright는 accent.bright와 동일 값이다 (S26-D: = accent.bright)", () => {
    expect(tokens.nodeCategory.processBright).toBe(tokens.accent.bright);
  });

  it("gradient.viewportActive가 v2.0 정정 종점(42%/40%/80%)을 포함한다", () => {
    expect(tokens.gradient.viewportActive).toBe(
      "radial-gradient(circle at 50% 42%, #12325e 0%, #0c1c38 40%, #080a10 80%)",
    );
  });

  it("gradient.shaderSphere가 5종점 정본 문자열과 일치한다", () => {
    expect(tokens.gradient.shaderSphere).toBe(
      "radial-gradient(circle at 40% 32%, #bcdcff 0%, #4ba3ff 26%, #2b6fe0 52%, #12336b 78%, #08152e 100%)",
    );
  });

  it("cssVars()가 S26 신규 CSS 변수를 자동 emit한다", () => {
    const css = cssVars();
    expect(css).toContain(`--accent-bright: ${tokens.accent.bright};`);
    expect(css).toContain(
      `--success-bright: ${tokens.semantic.successBright};`,
    );
    expect(css).toContain(
      `--node-cat-process-bright: ${tokens.nodeCategory.processBright};`,
    );
    expect(css).toContain(
      `--node-cat-value-bright: ${tokens.nodeCategory.valueBright};`,
    );
    expect(css).toContain(
      `--node-cat-output-bright: ${tokens.nodeCategory.outputBright};`,
    );
    expect(css).toContain(
      `--gradient-viewport-active: ${tokens.gradient.viewportActive};`,
    );
    expect(css).toContain(
      `--gradient-shader-sphere: ${tokens.gradient.shaderSphere};`,
    );
  });
});

describe("v2.1 토큰 개명 (X14)", () => {
  it("X14: skeletonStatus → floatingPill 개명 후에도 값이 불변이고 cssVars가 kebab emit한다", () => {
    expect(tokens.radius.floatingPill).toBe(10);
    expect(tokens.shadow.floatingPill).toBe("0 8px 24px rgba(0,0,0,0.5)");
    const css = cssVars();
    expect(css).toContain("--radius-floating-pill: 10px;");
    expect(css).toContain(
      `--shadow-floating-pill: ${tokens.shadow.floatingPill};`,
    );
  });
});

describe("withAlpha", () => {
  /** rgba(r, g, b, a) 문자열의 r/g/b 채널을 다시 "#rrggbb"로 재조립한다. */
  function rgbaToHex(rgba: string): string {
    const match = rgba.match(
      /^rgba\((\d{1,3}), (\d{1,3}), (\d{1,3}), [0-9.]+\)$/,
    );
    if (!match) throw new Error(`unexpected rgba format: ${rgba}`);
    const [, r, g, b] = match;
    const toHex = (channel: string | undefined) =>
      Number(channel).toString(16).padStart(2, "0");
    return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
  }

  it("rgba(r, g, b, 0.5) 형식을 생성하고 채널을 재조립하면 원본 hex와 일치한다", () => {
    const result = withAlpha(tokens.accent.default, 0.5);
    expect(result).toMatch(/^rgba\(\d{1,3}, \d{1,3}, \d{1,3}, 0\.5\)$/);
    expect(rgbaToHex(result)).toBe(tokens.accent.default);
  });

  it("모든 semantic 토큰에 대해 유효한 rgba(0.14) 문자열을 생성한다", () => {
    for (const hex of Object.values(tokens.semantic)) {
      const result = withAlpha(hex, 0.14);
      expect(result).toMatch(/^rgba\(\d{1,3}, \d{1,3}, \d{1,3}, 0\.14\)$/);
      expect(rgbaToHex(result)).toBe(hex);
    }
  });
});
