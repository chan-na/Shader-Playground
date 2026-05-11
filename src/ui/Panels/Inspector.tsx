import { useMemo } from 'react';
import { useGraphStore } from '../../state/graphStore';
import { useSelectionStore } from '../../state/selectionStore';
import { inspectorUniforms, parseUniforms, samplerUniforms } from '../../core/graph/uniformParser';
import { UniformControl } from './UniformControl';
import { ViewportControls } from './ViewportControls';
import { ParamInspector } from './ParamInspector';
import { UtilityInspector } from './UtilityInspector';
import type { ParamGraphNode, ShaderGraphNode } from '../../core/graph/types';

export interface InspectorProps {
  /** When embedded inside SidePanel, skip the outer panel + header wrapper. */
  embedded?: boolean;
}

export function Inspector({ embedded = false }: InspectorProps) {
  const selectedId = useSelectionStore((s) => s.selectedNodeId);
  const firstShaderId = useGraphStore((s) =>
    s.nodes.find((n) => n.kind === 'shader')?.id ?? null,
  );
  const effectiveId = selectedId ?? firstShaderId;

  const node = useGraphStore((s) =>
    s.nodes.find((n) => n.id === effectiveId) ?? null,
  );
  const setUniformValue = useGraphStore((s) => s.setUniformValue);

  const shaderNode = node?.kind === 'shader' ? (node as ShaderGraphNode) : null;

  const specs = useMemo(() => {
    if (!shaderNode) return [];
    return parseUniforms(`${shaderNode.vertexSource}\n${shaderNode.fragmentSource}`);
  }, [shaderNode?.vertexSource, shaderNode?.fragmentSource]);

  const visible = inspectorUniforms(specs);
  const samplers = samplerUniforms(specs);
  const systemUniforms = specs.filter((u) => u.system);

  const body = (
    <div className="panel-body" style={{ overflowY: 'auto' }}>
      <ViewportControls />

      {!node && (
        <div className="inspector-empty">No node selected</div>
      )}
      {node && (
        <>
          <div className="inspector-section">
            <div className="inspector-label">Node</div>
            <div style={{ color: '#ddd', fontSize: 13 }}>
              <div><strong>{node.kind}</strong> · <span style={{ color: '#888', fontFamily: 'monospace' }}>{node.id}</span></div>
              {node.kind === 'mesh' && (
                <div style={{ color: '#888', fontSize: 11, marginTop: 4 }}>
                  primitive: {node.primitive}
                </div>
              )}
              {node.kind === 'param' && (
                <div style={{ color: '#888', fontSize: 11, marginTop: 4 }}>
                  kind: {(node as ParamGraphNode).paramKind}
                </div>
              )}
            </div>
          </div>

          {node.kind === 'param' && (
            <ParamInspector node={node as ParamGraphNode} />
          )}

          {(node.kind === 'math' || node.kind === 'swizzle' || node.kind === 'combine') && (
            <UtilityInspector node={node} />
          )}

          {shaderNode && (
            <>
              <div className="inspector-section">
                <div className="inspector-label">Uniforms ({visible.length})</div>
                {visible.length === 0 && (
                  <div style={{ color: '#777', fontSize: 12 }}>
                    Add a <code>uniform float</code> or <code>uniform vec3</code> declaration in the shader to see controls here.
                  </div>
                )}
                {visible.map((spec) => (
                  <div key={spec.name} style={{ marginBottom: 10 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11 }}>
                      <span style={{ color: '#ccc', fontFamily: 'monospace' }}>{spec.label ?? spec.name}</span>
                      <span style={{ color: '#666' }}>{spec.type}</span>
                    </div>
                    <UniformControl
                      spec={spec}
                      value={shaderNode.uniformValues[spec.name]}
                      onChange={(v) => setUniformValue(shaderNode.id, spec.name, v)}
                    />
                  </div>
                ))}
              </div>

              {samplers.length > 0 && (
                <div className="inspector-section">
                  <div className="inspector-label">Sampler inputs</div>
                  {samplers.map((s) => (
                    <div key={s.name} style={{ fontSize: 12, color: '#bbb', fontFamily: 'monospace' }}>
                      {s.name} <span style={{ color: '#666' }}>({s.type})</span>
                    </div>
                  ))}
                  <div style={{ color: '#666', fontSize: 11, marginTop: 4 }}>
                    Connect via the node graph
                  </div>
                </div>
              )}

              {systemUniforms.length > 0 && (
                <div className="inspector-section">
                  <div className="inspector-label">System uniforms (auto)</div>
                  {systemUniforms.map((s) => (
                    <div key={s.name} style={{ fontSize: 11, color: '#777', fontFamily: 'monospace' }}>
                      {s.name} <span style={{ color: '#555' }}>· {s.type}</span>
                    </div>
                  ))}
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
