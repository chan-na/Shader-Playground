import { useMemo, useState } from "react";
import type {
  AudioGraphNode,
  ComputeGraphNode,
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
import { useGraphStore } from "../../state/graphStore";
import { useSelectionStore } from "../../state/selectionStore";
import { AudioInspector } from "./AudioInspector";
import { ParamInspector } from "./ParamInspector";
import { UniformControl } from "./UniformControl";
import { UtilityInspector } from "./UtilityInspector";
import { filterUniforms } from "./uniformFilter";
import { VideoInspector } from "./VideoInspector";
import { ViewportControls } from "./ViewportControls";
import { WebcamInspector } from "./WebcamInspector";

export interface InspectorProps {
  /** When embedded inside SidePanel, skip the outer panel + header wrapper. */
  embedded?: boolean;
}

export function Inspector({ embedded = false }: InspectorProps) {
  const selectedId = useSelectionStore((s) => s.selectedNodeId);
  const firstShaderId = useGraphStore(
    (s) => s.nodes.find((n) => n.kind === "shader")?.id ?? null,
  );
  const effectiveId = selectedId ?? firstShaderId;

  const node = useGraphStore(
    (s) => s.nodes.find((n) => n.id === effectiveId) ?? null,
  );
  const setUniformValue = useGraphStore((s) => s.setUniformValue);
  const setResolutionScale = useGraphStore((s) => s.setResolutionScale);

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

      {!node && <div className="inspector-empty">No node selected</div>}
      {node && (
        <>
          <div className="inspector-section">
            <div className="inspector-label">Node</div>
            <div style={{ color: "#ddd", fontSize: 13 }}>
              <div>
                <strong>{node.kind}</strong> ·{" "}
                <span style={{ color: "#888", fontFamily: "monospace" }}>
                  {node.id}
                </span>
              </div>
              {node.kind === "mesh" && (
                <div style={{ color: "#888", fontSize: 11, marginTop: 4 }}>
                  primitive: {node.primitive}
                </div>
              )}
              {node.kind === "param" && (
                <div style={{ color: "#888", fontSize: 11, marginTop: 4 }}>
                  kind: {(node as ParamGraphNode).paramKind}
                </div>
              )}
            </div>
          </div>

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
              <div style={{ color: "#bbb", fontSize: 11 }}>
                count: {computeNode.count.toLocaleString()}
                <br />
                primitive: {computeNode.primitive}
              </div>
              <div style={{ marginTop: 8 }}>
                <div className="inspector-label" style={{ fontSize: 11 }}>
                  Attributes
                </div>
                {computeNode.attributes.map((a) => (
                  <div
                    key={a.outName}
                    style={{
                      color: "#bbb",
                      fontFamily: "monospace",
                      fontSize: 11,
                    }}
                  >
                    {a.inName} → {a.outName}{" "}
                    <span style={{ color: "#666" }}>
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
              <select
                value={shaderNode.resolutionScale ?? 1}
                onChange={(e) =>
                  setResolutionScale(
                    shaderNode.id,
                    Number(e.target.value) as ResolutionScale,
                  )
                }
                data-testid="resolution-scale"
                style={{
                  width: "100%",
                  padding: "4px 8px",
                  fontSize: 12,
                  background: "#1a1a1a",
                  color: "#ddd",
                  border: "1px solid #333",
                  borderRadius: 3,
                  boxSizing: "border-box",
                }}
              >
                {RESOLUTION_SCALES.map((s) => (
                  <option key={s} value={s}>
                    {s === 1 ? "1× (full)" : `${s}×`}
                  </option>
                ))}
              </select>
              <div style={{ color: "#666", fontSize: 11, marginTop: 4 }}>
                이 패스의 FBO 해상도 배율 (다운샘플 체인용).
              </div>
            </div>
          )}

          {uniformOwner && (
            <>
              {totalUniformCount > 0 && (
                <div className="inspector-section">
                  <input
                    type="search"
                    placeholder="Filter uniforms (name / label / type)"
                    value={uniformQuery}
                    onChange={(e) => setUniformQuery(e.target.value)}
                    data-testid="uniform-search"
                    style={{
                      width: "100%",
                      padding: "4px 8px",
                      fontSize: 12,
                      background: "#1a1a1a",
                      color: "#ddd",
                      border: "1px solid #333",
                      borderRadius: 3,
                      boxSizing: "border-box",
                    }}
                  />
                </div>
              )}

              <div className="inspector-section">
                <div className="inspector-label">
                  Uniforms{" "}
                  {hasQuery
                    ? `(${filteredVisible.length}/${visible.length})`
                    : `(${visible.length})`}
                </div>
                {visible.length === 0 && (
                  <div style={{ color: "#777", fontSize: 12 }}>
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
                        justifyContent: "space-between",
                        fontSize: 11,
                      }}
                    >
                      <span style={{ color: "#ccc", fontFamily: "monospace" }}>
                        {spec.label ?? spec.name}
                      </span>
                      <span style={{ color: "#666" }}>{spec.type}</span>
                    </div>
                    <UniformControl
                      spec={spec}
                      value={uniformOwner.uniformValues[spec.name]}
                      onChange={(v) =>
                        setUniformValue(uniformOwner.id, spec.name, v)
                      }
                    />
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
                        color: "#bbb",
                        fontFamily: "monospace",
                      }}
                    >
                      {s.name} <span style={{ color: "#666" }}>({s.type})</span>
                    </div>
                  ))}
                  <div style={{ color: "#666", fontSize: 11, marginTop: 4 }}>
                    Connect via the node graph
                  </div>
                </div>
              )}

              {systemUniforms.length > 0 && filteredSystem.length > 0 && (
                <div className="inspector-section">
                  <div className="inspector-label">System uniforms (auto)</div>
                  <div
                    style={{
                      color: "#999",
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
                          color: "#777",
                          marginBottom: 2,
                          lineHeight: 1.4,
                        }}
                        data-testid="system-uniform-row"
                        data-uniform-name={s.name}
                      >
                        <span style={{ fontFamily: "monospace" }}>
                          {s.name}{" "}
                          <span style={{ color: "#555" }}>· {s.type}</span>
                        </span>
                        {desc && (
                          <span style={{ color: "#999", marginLeft: 6 }}>
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
                  style={{ color: "#777", fontSize: 12 }}
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
