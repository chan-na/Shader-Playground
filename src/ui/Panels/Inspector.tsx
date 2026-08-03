import { useMemo, useState } from "react";
import {
  FBO_TEXTURE_PARAMS,
  IMAGE_TEXTURE_PARAMS,
} from "../../core/gl/texture";
import type {
  AudioGraphNode,
  ComputeGraphNode,
  GraphEdge,
  GraphNode,
  GroupGraphNode,
  MeshGraphNode,
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
import { MeshInspectorSection } from "./MeshInspectorSection";
import { ParamInspector } from "./ParamInspector";
import { SystemUniformsSection } from "./SystemUniformsSection";
import { TextureParamsSection } from "./TextureParamsSection";
import { UniformControl } from "./UniformControl";
import { UniformHintEditor } from "./UniformHintEditor";
import { UtilityInspector } from "./UtilityInspector";
import { filterUniforms } from "./uniformFilter";
import { VaryingBridgeSection } from "./VaryingBridgeSection";
import { VideoInspector } from "./VideoInspector";
import { ViewportControls } from "./ViewportControls";
import { WebcamInspector } from "./WebcamInspector";

export interface InspectorProps {
  /** When embedded inside SidePanel, skip the outer panel + header wrapper. */
  embedded?: boolean;
}

/**
 * [L1/E-4] Resolve the display name of whatever node feeds `targetHandle` on
 * `targetId` via a graph edge, or `undefined` if nothing is wired there.
 * Shared by the uniform "driven by" note and the Sampler inputs section —
 * both ask the exact same question (is there an edge into this port, and
 * whose is it) against the same `(target, targetHandle)` shape `execute.ts`'s
 * `bindUserUniforms`/`bindSamplers` use to resolve bindings.
 *
 * A dead edge (source node removed, e.g. mid-undo) falls back to the raw
 * edge.source id rather than `displayNodeName`'s empty-string path — there is
 * no node to look up a kind/name from, so echoing the id is the only way to
 * avoid silently rendering an empty label.
 */
function drivingSourceName(
  edges: readonly GraphEdge[],
  nodes: readonly GraphNode[],
  targetId: string,
  targetHandle: string,
): string | undefined {
  const edge = edges.find(
    (e) => e.target === targetId && e.targetHandle === targetHandle,
  );
  if (!edge) return undefined;
  const sourceNode = nodes.find((n) => n.id === edge.source);
  return sourceNode ? displayNodeName(sourceNode) : edge.source;
}

/**
 * [#35] The node's *stored* editable title, i.e. the exact string the Name
 * field must round-trip. [A-2] A group keeps its title in `label` (that's
 * where `renameNode` routes it); every other kind keeps it in `name`.
 *
 * Deliberately NOT `displayNodeName()`: that falls back to the kind's label
 * ("Shader", "Output", …) for an unnamed node, and this value is fed straight
 * back into the draft — so seeding/reverting through it would let a blur
 * commit the literal string "Shader" as the node's real name.
 */
function titleOf(node: GraphNode): string {
  return node.kind === "group" ? node.label : (node.name ?? "");
}

/**
 * Common Inspector "Name" field (design/Side Panel.dc.html L75-81, D15).
 * Same rename source as the node card header's inline edit
 * (NodeCardHeader.tsx): `renameNode`, which writes `label` for groups and
 * `name` for everything else — so this one field renames every kind and
 * GroupInspector deliberately offers no competing Label input [A-2].
 *
 * Value is a local draft, not a direct binding to the stored title —
 * committing on every keystroke would push a history entry per character.
 * Only Enter/blur call `renameNode`; Escape reverts the draft. The parent
 * keys this component on `${node.id}:${titleOf(node)}` so an external rename
 * (card double-click edit, undo/redo) remounts it and re-syncs the draft.
 * Seed, Escape-revert and that remount key all read `titleOf` so the three
 * never disagree [#35].
 */
function NodeNameField({ node }: { node: GraphNode }) {
  const renameNode = useGraphStore((s) => s.renameNode);
  const [draft, setDraft] = useState(() => titleOf(node));

  // Mirrors displayNodeName()'s final fallback (registry.ts) without
  // consulting `name` — the placeholder must show what the title would
  // fall back to if the field were committed empty, not the current value.
  const fallback = NODE_META[node.kind].label;

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
              setDraft(titleOf(node));
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
  // [L1/E-4] Raw graph facts for "driven by"/sampler-connection display —
  // no derived store, just edges/nodes read straight from graphStore. These
  // only change on real graph edits (add/remove edge, add/remove node), not
  // per-frame uniform drags: dragging a slider bumps `uniformValues` inside
  // the same `nodes` array reference pattern the `node` selector above
  // already re-renders on, so this doesn't add a new render trigger — it
  // only adds two more `s.*` reads to renders that were happening anyway.
  const edges = useGraphStore((s) => s.edges);
  const allNodes = useGraphStore((s) => s.nodes);
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

          {/* [A-1·A-2] One Name field for every kind — params and groups
              included. Their old per-kind Label fields are gone. */}
          <NodeNameField key={`${node.id}:${titleOf(node)}`} node={node} />

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

          {node.kind === "mesh" && (
            <MeshInspectorSection node={node as MeshGraphNode} />
          )}

          {/* [E-3] Image nodes upload through createImageTexture — surface
              the actual wrap/filter/mipmap/flip parameters it applies
              (core/gl/texture.ts), not a hand-copied description. The note's
              parameter nouns are interpolated from the same constant as the
              structured rows (U3: no hand-copied wrap/filter strings that
              could contradict the rows if the constant ever changes). */}
          {node.kind === "image" && (
            <TextureParamsSection
              title="Texture sampling"
              info={IMAGE_TEXTURE_PARAMS}
              note={`이미지 텍스처는 ${IMAGE_TEXTURE_PARAMS.wrapS} + ${
                IMAGE_TEXTURE_PARAMS.mipmaps ? "mipmap" : "mipmap 없음"
              }. 중간 패스(FBO) 텍스처와 파라미터가 달라 같은 GLSL이 다른 결과를 낼 수 있다.`}
            />
          )}

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

          {/* [E-3] Every shader pass renders into an FBO texture created by
              createColorTexture — surface its actual parameters (they differ
              from Image nodes) so "why does the same GLSL look different
              sampling this vs. an Image node" has an answer in the UI. The
              note interpolates FBO_TEXTURE_PARAMS rather than hand-copying
              the values (U3), so it can never contradict the rows above. */}
          {shaderNode && (
            <TextureParamsSection
              title="Output texture (FBO)"
              info={FBO_TEXTURE_PARAMS}
              note={`이 노드의 출력을 다른 노드가 샘플링할 때 적용된다: ${FBO_TEXTURE_PARAMS.wrapS}·${
                FBO_TEXTURE_PARAMS.mipmaps ? "mipmap" : "mipmap 없음"
              } — Image 노드와 다르다.`}
            />
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
                {filteredVisible.map((spec) => {
                  // [#8] The open-hint-editor marker is scoped to
                  // (node, uniform), not to the bare uniform name: two nodes
                  // that both declare `u_time` are different rows, and
                  // selecting the other one used to leave its editor
                  // spring-loaded open (and the gear lit) for a spec it was
                  // never opened on. Compared as a whole string — never
                  // `.split(":")`, since node ids come from serialized
                  // projects and may themselves contain ":".
                  const hintKey = `${uniformOwner.id}:${spec.name}`;
                  // [L1/E-4] A uniform is also an input port (registry.ts
                  // shader/compute `inputs()`), so it can be fed by an edge —
                  // and when it is, `bindUserUniforms` (execute.ts) overwrites
                  // this control's value every frame. multi_input validation
                  // is fatal, so a *valid* graph never has more than one edge
                  // into a given (node, uniform) target — `.find` is enough.
                  const drivenBy = drivingSourceName(
                    edges,
                    allNodes,
                    uniformOwner.id,
                    spec.name,
                  );
                  return (
                    <div
                      key={spec.name}
                      style={{ marginBottom: 10 }}
                      data-testid="uniform-row"
                      data-uniform-name={spec.name}
                      data-uniform-control={spec.control}
                      data-driven={drivenBy !== undefined ? "true" : "false"}
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
                          {/* [L1/E-4] Deliberately not disabled while driven:
                              the hint (range/default/label) is a source-level
                              annotation independent of the live edge value, so
                              editing it is still meaningful even though the
                              control below is inert. */}
                          <button
                            type="button"
                            title="범위·기본값·라벨 편집 (소스 주석에 기록)"
                            data-testid="uniform-edit-toggle"
                            data-edit-uniform={spec.name}
                            onClick={() =>
                              setEditingHint((cur) =>
                                cur === hintKey ? null : hintKey,
                              )
                            }
                            style={{
                              padding: 0,
                              fontSize: 11,
                              lineHeight: 1,
                              background: "none",
                              border: "none",
                              color:
                                editingHint === hintKey
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
                        {...(drivenBy !== undefined ? { drivenBy } : {})}
                      />
                      {editingHint === hintKey && (
                        <UniformHintEditor
                          key={hintKey}
                          spec={spec}
                          onApply={(hints) => {
                            setUniformHints(uniformOwner.id, spec.name, hints);
                            setEditingHint(null);
                          }}
                          onClose={() => setEditingHint(null)}
                        />
                      )}
                    </div>
                  );
                })}
              </div>

              {samplers.length > 0 && filteredSamplers.length > 0 && (
                <div className="inspector-section">
                  <div className="inspector-label">Sampler inputs</div>
                  {filteredSamplers.map((s) => {
                    // [L1/E-4] Same (target, targetHandle) lookup as the
                    // uniform rows above — a sampler is a texture-typed input
                    // port (registry.ts), bound by `bindSamplers`
                    // (execute.ts) from the exact same edge shape.
                    const connectedFrom = drivingSourceName(
                      edges,
                      allNodes,
                      uniformOwner.id,
                      s.name,
                    );
                    return (
                      <div
                        key={s.name}
                        data-testid="sampler-input-row"
                        data-uniform-name={s.name}
                        data-connected={
                          connectedFrom !== undefined ? "true" : "false"
                        }
                        style={{
                          fontSize: 12,
                          color: "var(--text-bright-body)",
                          fontFamily: "var(--font-mono)",
                        }}
                      >
                        {s.name}{" "}
                        <span style={{ color: "var(--text-muted)" }}>
                          ({s.type})
                        </span>{" "}
                        {connectedFrom !== undefined ? (
                          <span style={{ color: "var(--text-secondary)" }}>
                            ← {connectedFrom}
                          </span>
                        ) : (
                          <span style={{ color: "var(--text-muted)" }}>
                            미연결
                          </span>
                        )}
                      </div>
                    );
                  })}
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
                <SystemUniformsSection
                  specs={filteredSystem}
                  owner={uniformOwner}
                />
              )}

              {/* [A-2, T4] A varying is not a uniform, so `uniformQuery`
                  (which only filters the uniform/sampler/system rows above)
                  must never hide this section — it's rendered outside every
                  `filtered*`/`noMatches` branch, and unconditionally on
                  `shaderNode` so it shows even when the node declares zero
                  uniforms. Gated on `shaderNode` rather than `uniformOwner`:
                  a compute node has no fragment stage to bridge to. */}
              {shaderNode && <VaryingBridgeSection nodeId={shaderNode.id} />}

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
