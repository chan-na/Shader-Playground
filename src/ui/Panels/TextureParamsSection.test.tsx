import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import {
  FBO_TEXTURE_PARAMS,
  IMAGE_TEXTURE_PARAMS,
} from "../../core/gl/texture";
import { TextureParamsSection } from "./TextureParamsSection";

afterEach(() => {
  cleanup();
});

describe("TextureParamsSection [E-3]", () => {
  it("renders the Image texture's REPEAT/mipmap/flip-Y parameters + note", () => {
    render(
      <TextureParamsSection
        title="Texture sampling"
        info={IMAGE_TEXTURE_PARAMS}
        note="이미지 텍스처는 REPEAT + mipmap."
      />,
    );

    const section = screen.getByTestId("texture-params");
    expect(section.textContent).toContain("Texture sampling");
    expect(section.textContent).toContain("wrap: REPEAT");
    expect(section.textContent).toContain(
      "filter: LINEAR_MIPMAP_LINEAR → LINEAR",
    );
    expect(section.textContent).toContain("mipmaps: yes");
    expect(section.textContent).toContain("flip-Y on upload: yes");
    expect(section.textContent).toContain("이미지 텍스처는 REPEAT + mipmap.");
  });

  it("renders the FBO texture's CLAMP_TO_EDGE/no-mipmap/no-flip parameters + note", () => {
    render(
      <TextureParamsSection
        title="Output texture (FBO)"
        info={FBO_TEXTURE_PARAMS}
        note="다른 노드가 샘플링할 때 적용된다."
      />,
    );

    const section = screen.getByTestId("texture-params");
    expect(section.textContent).toContain("Output texture (FBO)");
    expect(section.textContent).toContain("wrap: CLAMP_TO_EDGE");
    expect(section.textContent).toContain("filter: LINEAR → LINEAR");
    expect(section.textContent).toContain("mipmaps: no");
    expect(section.textContent).toContain("flip-Y on upload: no");
    expect(section.textContent).toContain("다른 노드가 샘플링할 때 적용된다.");
  });
});
