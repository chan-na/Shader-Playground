import type { NodeVaryingRow } from "../../state/passPlanStore";
import { usePassPlanStore } from "../../state/passPlanStore";

export interface VaryingBridgeSectionProps {
  nodeId: string;
}

/**
 * [A-2, T4] Row rendering rule for `missing-out`/`type-mismatch`: both share
 * the same confidence/usage mitigation ladder (spelled out in the unit brief)
 * — a real link-error warning only fires when the diff is both confident
 * *and* the fragment side statically uses the varying. Order matters: an
 * unused declaration is muted-quiet even under low confidence (there's
 * nothing to warn about either way), so `fragmentUsed` is checked before
 * `confident`.
 */
function riskGlyphAndNote(
  row: NodeVaryingRow,
  confident: boolean,
  warnMessage: string,
): { glyph: string | null; note: string } {
  if (confident && row.fragmentUsed) {
    return { glyph: "⚠", note: warnMessage };
  }
  if (!row.fragmentUsed) {
    return { glyph: null, note: "(선언만 있고 미사용 — 링크는 통과)" };
  }
  return { glyph: null, note: HOLD_NOTE };
}

/**
 * Shared "we can't tell" note. Deliberately does NOT name a cause: confidence
 * is withdrawn by five distinct hazards in `varyingContract.ts` (preprocessor
 * branch, interface block, line-wrapped storage declaration, an inter-stage
 * qualifier/array-size disagreement, an unterminated block comment), and the
 * earlier copy named only the first two — so a shader held for a qualifier
 * mismatch was told the reason was a preprocessor branch it doesn't contain.
 * Attributing the hold precisely would mean plumbing a reason code through
 * `passPlanStore`; until then, saying less is the honest option.
 */
const HOLD_NOTE = "(파서가 확신할 수 없는 선언 형태 — 판정 보류)";

/** [A-2, T4] Same caption-style block SystemUniformsSection uses for its
 *  explanatory note (11px, `var(--text-secondary)`, no card/border). */
const CAPTION_STYLE = {
  color: "var(--text-secondary)",
  fontSize: 11,
  marginTop: 2,
  marginBottom: 6,
  lineHeight: 1.4,
} as const;

const ROW_STYLE = {
  fontSize: 11,
  color: "var(--text-muted)",
  marginBottom: 2,
  lineHeight: 1.4,
} as const;

/**
 * [A-2, T4] "Varyings (vertex ▸ fragment)" Inspector section — the vertex
 * `out` ↔ fragment `in` link contract GLSL enforces at link time but this
 * app has never shown anywhere (there is no port/edge for it). Data comes
 * straight from `passPlanStore.varyingsByNode`, published once per recompile
 * by `buildVaryingContracts` (`Viewport/passPlanPublish.ts`) from the exact
 * source pair the GL compiler saw — never re-derived here.
 *
 * Structural mirror of `MeshInspectorSection`/`SystemUniformsSection`: same
 * `.inspector-section`/`.inspector-label` shell, font-mono name + muted type
 * per row, no new CSS class or token.
 *
 * `contract.confident === false` holds the verdict in BOTH directions: the
 * warn rows above already suppress their ⚠, and the `linked` rows suppress
 * their green ✓ too — the diff was computed from a declaration set that may
 * not be what actually compiled (a vertex `out` inside a dead `#ifdef`
 * branch still lands in the symbol table), so asserting "연결됨" from it can
 * directly contradict a real link failure's ErrorBadge. The section caption
 * carries the shared "판정 보류" note instead of a per-row one.
 */
export function VaryingBridgeSection({ nodeId }: VaryingBridgeSectionProps) {
  const contract = usePassPlanStore((s) => s.varyingsByNode[nodeId]);
  const isFullscreen = usePassPlanStore(
    (s) => s.fullscreenByNode[nodeId] === true,
  );

  if (!contract || contract.rows.length === 0) return null;

  return (
    <div
      className="inspector-section"
      data-testid="varying-bridge"
      data-confident={contract.confident}
    >
      <div className="inspector-label">Varyings (vertex ▸ fragment)</div>
      <div style={CAPTION_STYLE}>
        vertex의 out과 fragment의 in을 잇는 스테이지 간 계약입니다.
        {isFullscreen && " vertex 계약 출처: fullscreen.vert (auto)"}
        {!contract.confident && ` ${HOLD_NOTE}`}
      </div>
      {contract.rows.map((row) => {
        let glyph: string | null = null;
        let glyphColor = "var(--success)";
        let note = "";
        let nameMuted = false;

        if (row.status === "linked") {
          // Positive assertion only under confidence — see the component doc.
          if (contract.confident) glyph = "✓";
        } else if (row.status === "unused") {
          // "fragment가 받지 않음" is as much a positive assertion as the ✓
          // above, and it fails in the same way: an unterminated `/*` in the
          // fragment source erases every `in` declaration below it, turning
          // the vertex outputs that *are* consumed into `unused` rows. Held
          // under the same gate rather than stated confidently.
          if (contract.confident) {
            nameMuted = true;
            note = "(미사용 — fragment가 받지 않음)";
          }
        } else {
          const warnMessage =
            row.status === "missing-out"
              ? "vertex가 제공하지 않음 — 링크 에러 예상"
              : `vertex ${row.vertexType} ≠ fragment ${row.fragmentType}`;
          const risk = riskGlyphAndNote(row, contract.confident, warnMessage);
          glyph = risk.glyph;
          glyphColor = "var(--warning)";
          note = risk.note;
        }

        return (
          <div
            key={row.name}
            style={ROW_STYLE}
            data-testid="varying-row"
            data-varying-name={row.name}
            data-status={row.status}
          >
            <span style={{ fontFamily: "var(--font-mono)" }}>
              <span
                style={
                  nameMuted ? { color: "var(--text-disabled)" } : undefined
                }
              >
                {row.name}
              </span>{" "}
              <span style={{ color: "var(--text-disabled)" }}>
                · {row.vertexType ?? row.fragmentType}
              </span>
            </span>
            {glyph && (
              <span style={{ color: glyphColor, marginLeft: 6 }}>{glyph}</span>
            )}
            {note && (
              <span style={{ color: "var(--text-muted)", marginLeft: 6 }}>
                {note}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}
