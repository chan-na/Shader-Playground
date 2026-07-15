import { useMemo, useState } from "react";
import type {
  AudioGraphNode,
  ComputeGraphNode,
  GraphNode,
  GroupGraphNode,
  ParamGraphNode,
  ResolutionScale,
  ShaderGraphNode,
  VideoGraphNode,
  WebcamGraphNode,
} from "../../core/graph/types";
import { RESOLUTION_SCALES } from "../../core/graph/types";
import {
  inspectorUniforms,
  parseUniforms,
  SYSTEM_UNIFORM_DESCRIPTIONS,
  samplerUniforms,
} from "../../core/graph/uniformParser";
import { displayNodeName, NODE_META } from "../../core/nodes/registry";
import { useGraphStore } from "../../state/graphStore";
import { useSelectionStore } from "../../state/selectionStore";
import { tokens, withAlpha } from "../../theme";
import { SelectField } from "../controls/SelectField";
import { TextField } from "../controls/TextField";
import { AudioInspector } from "./AudioInspector";
import { GroupInspector } from "./GroupInspector";
import { InspectorNodeHeader } from "./InspectorNodeHeader";
import { ParamInspector } from "./ParamInspector";
import { UniformControl } from "./UniformControl";
import { UniformHintEditor } from "./UniformHintEditor";
import { UtilityInspector } from "./UtilityInspector";
import { filterUniforms } from "./uniformFilter";
import { VideoInspector } from "./VideoInspector";
import { ViewportControls } from "./ViewportControls";
import { WebcamInspector } from "./WebcamInspector";

export interface InspectorProps {
  /** When embedded inside SidePanel, skip the outer panel + header wrapper. */
  embedded?: boolean;
}

/**
 * Common Inspector "Name" field (design/Side Panel.dc.html L75-81, D15).
 * Same rename source as the node card header's inline edit
 * (NodeCardHeader.tsx): `node.name` / `graphStore.renameNode`. Never
 * rendered for "group" — a group's rename affordance is its `label` field
 * (GroupInspector's Label input + GroupNodeView's header inline edit),
 * which `displayNodeName()` already treats as the sole source of truth for
 * group naming, so a second Name field here would just be a redundant
 * second writer of the same concept.
 *
 * Value is a local draft, not a direct binding to `node.name` — committing
 * on every keystroke would push a history entry per character. Only
 * Enter/blur call `renameNode`; Escape reverts the draft. The parent keys
 * this component on `${node.id}:${node.name ?? ""}` so an external rename
 * (card double-click edit, undo/redo) remounts it and re-syncs the draft.
 */
function NodeNameField({ node }: { node: GraphNode }) {
  const renameNode = useGraphStore((s) => s.renameNode);
  const [draft, setDraft] = useState(node.name ?? "");

  // Mirrors displayNodeName()'s fallback steps 3-4 (registry.ts) without
  // consulting `name` — the placeholder must show what the title would
  // fall back to if the field were committed empty, not the current value.
  const fallback =
    node.kind === "param" && node.label
      ? node.label
      : NODE_META[node.kind].label;

  return (
    <div style={{ padding: "13px 14px 0" }}>
      <div
        style={{
          fontSize: 11,
          color: "var(--text-secondary)",
          marginBottom: 7,
        }}
      >
        Name
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <TextField
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => renameNode(node.id, draft)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              renameNode(node.id, draft);
            } else if (e.key === "Escape") {
              e.preventDefault();
              setDraft(node.name ?? "");
            }
          }}
          placeholder={fallback}
          maxLength={256}
          dataTestId="node-name-input"
        />
        <span
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 9,
            color: "var(--text-muted)",
            whiteSpace: "nowrap",
          }}
        >
          ↵ rename
        </span>
      </div>
    </div>
  );
}

export function Inspector({ embedded = false }: InspectorProps) {
  const selectedId = useSelectionStore((s) => s.selectedNodeId);
  const selectedCount = useSelectionStore((s) => s.selectedNodeIds.length);
  const firstShaderId = useGraphStore(
    (s) => s.nodes.find((n) => n.kind === "shader")?.id ?? null,
  );
  const effectiveId = selectedId ?? firstShaderId;

  const node = useGraphStore(
    (s) => s.nodes.find((n) => n.id === effectiveId) ?? null,
  );
  const setUniformValue = useGraphStore((s) => s.setUniformValue);
  const setUniformHints = useGraphStore((s) => s.setUniformHints);
  const setResolutionScale = useGraphStore((s) => s.setResolutionScale);
  const [editingHint, setEditingHint] = useState<string | null>(null);

  const shaderNode = node?.kind === "shader" ? (node as ShaderGraphNode) : null;
  const computeNode =
    node?.kind === "compute" ? (node as ComputeGraphNode) : null;

  const specs = useMemo(() => {
    if (shaderNode)
      return parseUniforms(
        `${shaderNode.vertexSource}\n${shaderNode.fragmentSource}`,
      );
    if (computeNode) return parseUniforms(computeNode.vertexSource);
    return [];
  }, [
    shaderNode?.vertexSource,
    shaderNode?.fragmentSource,
    shaderNode,
    computeNode?.vertexSource,
    computeNode,
  ]);

  const uniformOwner = shaderNode ?? computeNode;
  const visible = inspectorUniforms(specs);
  const samplers = shaderNode ? samplerUniforms(specs) : [];
  const systemUniforms = specs.filter((u) => u.system);

  const [uniformQuery, setUniformQuery] = useState("");
  const filteredVisible = useMemo(
    () => filterUniforms(visible, uniformQuery),
    [visible, uniformQuery],
  );
  const filteredSamplers = useMemo(
    () => filterUniforms(samplers, uniformQuery),
    [samplers, uniformQuery],
  );
  const filteredSystem = useMemo(
    () => filterUniforms(systemUniforms, uniformQuery),
    [systemUniforms, uniformQuery],
  );
  const totalUniformCount =
    visible.length + samplers.length + systemUniforms.length;
  const filteredTotal =
    filteredVisible.length + filteredSamplers.length + filteredSystem.length;
  const hasQuery = uniformQuery.trim().length > 0;
  const noMatches = hasQuery && filteredTotal === 0;

  const body = (
    <div className="panel-body" style={{ overflowY: "auto" }}>
      <ViewportControls />

      {selectedCount > 1 && (
        <div
          className="inspector-section"
          data-testid="multi-select-banner"
          style={{
            background: "var(--surface-card)",
            border: "1px solid var(--border-default)",
            borderRadius: "var(--radius-input)",
            fontSize: 12,
            color: "var(--text-bright-body)",
          }}
        >
          <strong>{selectedCount} nodes selected</strong>
          {node && (
            <span>
              {" "}
              · editing <span>{displayNodeName(node)}</span>
            </span>
          )}
          <div
            style={{ color: "var(--text-muted)", fontSize: 11, marginTop: 4 }}
          >
            화살표로 함께 이동, Delete로 함께 삭제. 아래 편집은 마지막으로
            선택한 노드에만 적용됩니다.
          </div>
        </div>
      )}

      {!node && <div className="inspector-empty">No node selected</div>}
      {node && (
        <>
          <InspectorNodeHeader node={node} />

          {node.kind !== "group" && (
            <NodeNameField key={`${node.id}:${node.name ?? ""}`} node={node} />
          )}

          {node.kind === "group" && (
            <GroupInspector node={node as GroupGraphNode} />
          )}

          {node.kind === "param" && (
            <ParamInspector node={node as ParamGraphNode} />
          )}

          {node.kind === "webcam" && (
            <WebcamInspector node={node as WebcamGraphNode} />
          )}

          {node.kind === "video" && (
            <VideoInspector node={node as VideoGraphNode} />
          )}

          {node.kind === "audio" && (
            <AudioInspector node={node as AudioGraphNode} />
          )}

          {(node.kind === "math" ||
            node.kind === "swizzle" ||
            node.kind === "combine") && <UtilityInspector node={node} />}

          {computeNode && (
            <div className="inspector-section">
              <div className="inspector-label">Compute</div>
              <div
                style={{
                  display: "flex",
                  gap: 6,
                  flexWrap: "wrap",
                  marginBottom: 8,
                }}
              >
                <span
                  style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: 10,
                    color: "var(--text-secondary)",
                    background: "var(--surface-card)",
                    border: "1px solid var(--border-default)",
                    borderRadius: "var(--radius-icon-box)",
                    padding: "2px 7px",
                  }}
                >
                  count: {computeNode.count.toLocaleString()}
                </span>
                <span
                  style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: 10,
                    color: "var(--text-secondary)",
                    background: "var(--surface-card)",
                    border: "1px solid var(--border-default)",
                    borderRadius: "var(--radius-icon-box)",
                    padding: "2px 7px",
                  }}
                >
                  primitive: {computeNode.primitive}
                </span>
              </div>
              <div style={{ marginTop: 8 }}>
                <div className="inspector-label" style={{ fontSize: 11 }}>
                  Attributes
                </div>
                {computeNode.attributes.map((a) => (
                  <div
                    key={a.outName}
                    style={{
                      color: "var(--text-bright-body)",
                      fontFamily: "var(--font-mono)",
                      fontSize: 11,
                    }}
                  >
                    {a.inName} → {a.outName}{" "}
                    <span style={{ color: "var(--text-muted)" }}>
                      ({a.size}, seed={a.seed})
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {shaderNode && (
            <div className="inspector-section">
              <div className="inspector-label">Render resolution</div>
              <SelectField
                value={shaderNode.resolutionScale ?? 1}
                onChange={(e) =>
                  setResolutionScale(
                    shaderNode.id,
                    Number(e.target.value) as ResolutionScale,
                  )
                }
                dataTestId="resolution-scale"
              >
                {RESOLUTION_SCALES.map((s) => (
                  <option key={s} value={s}>
                    {s === 1 ? "1× (full)" : `${s}×`}
                  </option>
                ))}
              </SelectField>
              <div
                style={{
                  color: "var(--text-muted)",
                  fontSize: 11,
                  marginTop: 4,
                }}
              >
                이 패스의 FBO 해상도 배율 (다운샘플 체인용).
              </div>
            </div>
          )}

          {uniformOwner && (
            <>
              {totalUniformCount > 0 && (
                <div className="inspector-section">
                  <TextField
                    type="search"
                    placeholder="Filter uniforms (name / label / type)"
                    value={uniformQuery}
                    onChange={(e) => setUniformQuery(e.target.value)}
                    dataTestId="uniform-search"
                  />
                </div>
              )}

              <div className="inspector-section">
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    marginBottom: 4,
                  }}
                >
                  <div className="inspector-label" style={{ marginBottom: 0 }}>
                    Uniforms{" "}
                    {hasQuery
                      ? `(${filteredVisible.length}/${visible.length})`
                      : `(${visible.length})`}
                  </div>
                  <span
                    style={{
                      fontFamily: "var(--font-mono)",
                      fontSize: 8.5,
                      color: "var(--accent-hover)",
                      background: withAlpha(tokens.accent.default, 0.14),
                      border: "1px solid var(--accent-muted)",
                      // design/Side Panel.dc.html L79: border-radius:4px — no
                      // tokens.radius entry matches (iconBox is the nearest
                      // at 5), so this one-off badge keeps the literal value.
                      borderRadius: 4,
                      padding: "1px 5px",
                    }}
                  >
                    AUTO
                  </span>
                </div>
                <div
                  style={{
                    fontSize: 10.5,
                    color: "var(--text-muted)",
                    lineHeight: 1.5,
                    marginBottom: 14,
                  }}
                >
                  Generated from shader source. Annotate with{" "}
                  <span
                    style={{
                      fontFamily: "var(--font-mono)",
                      color: tokens.portFamily.scalar,
                    }}
                  >
                    {"// @range"}
                  </span>{" "}
                  ·{" "}
                  <span
                    style={{
                      fontFamily: "var(--font-mono)",
                      color: tokens.portFamily.scalar,
                    }}
                  >
                    @color
                  </span>
                  .
                </div>
                {visible.length === 0 && (
                  <div style={{ color: "var(--text-muted)", fontSize: 12 }}>
                    Add a <code>uniform float</code> or{" "}
                    <code>uniform vec3</code> declaration in the shader to see
                    controls here.
                  </div>
                )}
                {filteredVisible.map((spec) => (
                  <div
                    key={spec.name}
                    style={{ marginBottom: 10 }}
                    data-testid="uniform-row"
                    data-uniform-name={spec.name}
                    data-uniform-control={spec.control}
                  >
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        marginBottom: 7,
                      }}
                    >
                      <span
                        style={{
                          fontFamily: "var(--font-mono)",
                          fontSize: 11.5,
                          color: tokens.syntax.variable,
                        }}
                      >
                        {spec.label ?? spec.name}
                      </span>
                      <span
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 6,
                        }}
                      >
                        <span
                          style={{
                            fontFamily: "var(--font-mono)",
                            fontSize: 10,
                            color: "var(--text-muted)",
                          }}
                        >
                          {spec.type}
                        </span>
                        <button
                          type="button"
                          title="범위·기본값·라벨 편집 (소스 주석에 기록)"
                          data-testid="uniform-edit-toggle"
                          data-edit-uniform={spec.name}
                          onClick={() =>
                            setEditingHint((cur) =>
                              cur === spec.name ? null : spec.name,
                            )
                          }
                          style={{
                            padding: 0,
                            fontSize: 11,
                            lineHeight: 1,
                            background: "none",
                            border: "none",
                            color:
                              editingHint === spec.name
                                ? "var(--accent-default)"
                                : "var(--text-muted)",
                            cursor: "pointer",
                          }}
                        >
                          ⚙
                        </button>
                      </span>
                    </div>
                    <UniformControl
                      spec={spec}
                      value={uniformOwner.uniformValues[spec.name]}
                      onChange={(v) =>
                        setUniformValue(uniformOwner.id, spec.name, v)
                      }
                    />
                    {editingHint === spec.name && (
                      <UniformHintEditor
                        spec={spec}
                        onApply={(hints) => {
                          setUniformHints(uniformOwner.id, spec.name, hints);
                          setEditingHint(null);
                        }}
                        onClose={() => setEditingHint(null)}
                      />
                    )}
                  </div>
                ))}
              </div>

              {samplers.length > 0 && filteredSamplers.length > 0 && (
                <div className="inspector-section">
                  <div className="inspector-label">Sampler inputs</div>
                  {filteredSamplers.map((s) => (
                    <div
                      key={s.name}
                      style={{
                        fontSize: 12,
                        color: "var(--text-bright-body)",
                        fontFamily: "var(--font-mono)",
                      }}
                    >
                      {s.name}{" "}
                      <span style={{ color: "var(--text-muted)" }}>
                        ({s.type})
                      </span>
                    </div>
                  ))}
                  <div
                    style={{
                      color: "var(--text-muted)",
                      fontSize: 11,
                      marginTop: 4,
                    }}
                  >
                    Connect via the node graph
                  </div>
                </div>
              )}

              {systemUniforms.length > 0 && filteredSystem.length > 0 && (
                <div className="inspector-section">
                  <div className="inspector-label">System uniforms (auto)</div>
                  <div
                    style={{
                      color: "var(--text-secondary)",
                      fontSize: 11,
                      marginTop: 2,
                      marginBottom: 6,
                      lineHeight: 1.4,
                    }}
                  >
                    렌더러가 자동 주입하므로 그래프 input port에는 노출되지
                    않습니다.
                  </div>
                  {filteredSystem.map((s) => {
                    const desc = SYSTEM_UNIFORM_DESCRIPTIONS[s.name];
                    return (
                      <div
                        key={s.name}
                        style={{
                          fontSize: 11,
                          color: "var(--text-muted)",
                          marginBottom: 2,
                          lineHeight: 1.4,
                        }}
                        data-testid="system-uniform-row"
                        data-uniform-name={s.name}
                      >
                        <span style={{ fontFamily: "var(--font-mono)" }}>
                          {s.name}{" "}
                          <span style={{ color: "var(--text-disabled)" }}>
                            · {s.type}
                          </span>
                        </span>
                        {desc && (
                          <span
                            style={{
                              color: "var(--text-secondary)",
                              marginLeft: 6,
                            }}
                          >
                            — {desc}
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              {noMatches && (
                <div
                  className="inspector-section"
                  data-testid="uniform-search-empty"
                  style={{ color: "var(--text-muted)", fontSize: 12 }}
                >
                  No uniforms match "{uniformQuery.trim()}".
                </div>
              )}
            </>
          )}
        </>
      )}
    </div>
  );

  if (embedded) return body;

  return (
    <div className="panel panel--inspector">
      <div className="panel-header">Inspector</div>
      {body}
    </div>
  );
}
