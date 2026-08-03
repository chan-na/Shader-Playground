import type { TextureParamInfo } from "../../core/gl/texture";

export interface TextureParamsSectionProps {
  title: string;
  info: TextureParamInfo;
  note: string;
}

/**
 * [E-3] Displays a texture's actual wrap/filter/mipmap/flip parameters,
 * derived straight from `core/gl/texture.ts`'s `FBO_TEXTURE_PARAMS` /
 * `IMAGE_TEXTURE_PARAMS` constants — never a hand-copied string. Same
 * `.inspector-section`/`.inspector-label` + mono-row shape as
 * `MeshInspectorSection` (display-only, no interactivity — see D-4 in
 * `docs/learnability-plan-2026-08.md`, out of scope for this round).
 */
export function TextureParamsSection({
  title,
  info,
  note,
}: TextureParamsSectionProps) {
  return (
    <div className="inspector-section" data-testid="texture-params">
      <div className="inspector-label">{title}</div>
      <div
        style={{
          color: "var(--text-bright-body)",
          fontFamily: "var(--font-mono)",
          fontSize: 11,
          lineHeight: 1.6,
        }}
      >
        <div>wrap: {info.wrapS}</div>
        <div>
          filter: {info.minFilter} → {info.magFilter}
        </div>
        <div>mipmaps: {info.mipmaps ? "yes" : "no"}</div>
        <div>flip-Y on upload: {info.flipY ? "yes" : "no"}</div>
      </div>
      <div style={{ color: "var(--text-muted)", fontSize: 11, marginTop: 6 }}>
        {note}
      </div>
    </div>
  );
}
