import { describe, expect, it } from "vitest";
import type { GraphNodeKind, PortType } from "../../core/graph/types";
import { tokens } from "../../theme";
import {
  categoryHexFor,
  NODE_CATEGORY_OF,
  NODE_GLYPH,
  type PortFamily,
  portFamilyHex,
  portFamilyOf,
} from "./nodeTheme";

/** 브리프 6종 PortType 전수 → 기대 패밀리. design/README.md §도메인 규칙. */
const PORT_TYPE_FAMILIES: Array<{ type: PortType; family: PortFamily }> = [
  { type: "mesh", family: "resource" },
  { type: "texture", family: "resource" },
  { type: "float", family: "scalar" },
  { type: "vec2", family: "vector" },
  { type: "vec3", family: "vector" },
  { type: "vec4", family: "vector" },
];

describe("portFamilyOf / portFamilyHex", () => {
  it.each(
    PORT_TYPE_FAMILIES,
  )("$type → family $family (tokens.portFamily 참조)", ({ type, family }) => {
    expect(portFamilyOf(type)).toBe(family);
    expect(portFamilyHex(type)).toBe(tokens.portFamily[family]);
  });

  it("PortType 6종을 전수 커버한다", () => {
    expect(PORT_TYPE_FAMILIES.map((p) => p.type).sort()).toEqual(
      ["float", "mesh", "texture", "vec2", "vec3", "vec4"].sort(),
    );
  });
});

/** 13종 GraphNodeKind 전수 → 기대 카테고리. design/README.md §nodeCategory 매핑. */
const EXPECTED_CATEGORY: Record<
  GraphNodeKind,
  keyof typeof tokens.nodeCategory
> = {
  mesh: "source",
  image: "source",
  webcam: "source",
  video: "source",
  audio: "source",
  shader: "process",
  compute: "process",
  output: "output",
  param: "value",
  math: "value",
  swizzle: "value",
  combine: "value",
  group: "container",
};

describe("NODE_CATEGORY_OF / categoryHexFor", () => {
  const kinds = Object.keys(EXPECTED_CATEGORY) as GraphNodeKind[];

  it("GraphNodeKind 13종을 전수 커버한다", () => {
    expect(Object.keys(NODE_CATEGORY_OF).sort()).toEqual([...kinds].sort());
  });

  it.each(
    kinds,
  )("%s → 기대 카테고리와 hex가 tokens.nodeCategory와 일치", (kind) => {
    const expectedCategory = EXPECTED_CATEGORY[kind];
    expect(NODE_CATEGORY_OF[kind]).toBe(expectedCategory);
    expect(categoryHexFor(kind)).toBe(tokens.nodeCategory[expectedCategory]);
  });
});

/** 13종 GraphNodeKind 전수 → 헤더 아이콘 박스 글리프. design/Node Editor.dc.html
 * L371-382 renderVals()의 cats[].nodes[].glyph 전수. */
describe("NODE_GLYPH", () => {
  const kinds = Object.keys(EXPECTED_CATEGORY) as GraphNodeKind[];

  it("GraphNodeKind 13종을 전수 커버한다", () => {
    expect(Object.keys(NODE_GLYPH).sort()).toEqual([...kinds].sort());
  });

  it.each(kinds)("%s → 비어있지 않은 단일 글리프", (kind) => {
    const glyph = NODE_GLYPH[kind];
    expect(glyph.length).toBeGreaterThan(0);
    expect([...glyph]).toHaveLength(1);
  });
});
