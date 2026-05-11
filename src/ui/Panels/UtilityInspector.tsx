import { useGraphStore } from '../../state/graphStore';
import type {
  CombineArity,
  CombineGraphNode,
  GraphNode,
  MathGraphNode,
  MathOp,
  SwizzleGraphNode,
} from '../../core/graph/types';
import { isValidSwizzleMask } from '../../core/nodes/utility';

const MATH_OPS: MathOp[] = ['add', 'subtract', 'multiply', 'divide', 'pow', 'abs', 'sin', 'cos'];

export function UtilityInspector({ node }: { node: GraphNode }) {
  if (node.kind === 'math') return <MathInspector node={node as MathGraphNode} />;
  if (node.kind === 'swizzle') return <SwizzleInspector node={node as SwizzleGraphNode} />;
  if (node.kind === 'combine') return <CombineInspector node={node as CombineGraphNode} />;
  return null;
}

function MathInspector({ node }: { node: MathGraphNode }) {
  const setMathConfig = useGraphStore((s) => s.setMathConfig);
  const isUnary = node.op === 'abs' || node.op === 'sin' || node.op === 'cos';
  return (
    <div className="inspector-section">
      <div className="inspector-label">Math operator</div>
      <select
        value={node.op}
        onChange={(e) => setMathConfig(node.id, { op: e.target.value as MathOp })}
        style={{ width: '100%' }}
      >
        {MATH_OPS.map((op) => (
          <option key={op} value={op}>{op}</option>
        ))}
      </select>
      <div className="inspector-row" style={{ marginTop: 8 }}>
        <span style={{ width: 12, color: '#888', fontFamily: 'monospace' }}>a</span>
        <input
          type="number"
          step={0.01}
          value={node.a}
          onChange={(e) => setMathConfig(node.id, { a: parseFloat(e.target.value) })}
        />
      </div>
      {!isUnary && (
        <div className="inspector-row">
          <span style={{ width: 12, color: '#888', fontFamily: 'monospace' }}>b</span>
          <input
            type="number"
            step={0.01}
            value={node.b}
            onChange={(e) => setMathConfig(node.id, { b: parseFloat(e.target.value) })}
          />
        </div>
      )}
      <div style={{ color: '#666', fontSize: 11, marginTop: 4 }}>
        Default values used when no input edge is connected.
      </div>
    </div>
  );
}

function SwizzleInspector({ node }: { node: SwizzleGraphNode }) {
  const setSwizzleMask = useGraphStore((s) => s.setSwizzleMask);
  const valid = isValidSwizzleMask(node.mask);
  return (
    <div className="inspector-section">
      <div className="inspector-label">Swizzle mask</div>
      <input
        type="text"
        value={node.mask}
        onChange={(e) => setSwizzleMask(node.id, e.target.value.toLowerCase().replace(/[^xyzw]/g, ''))}
        placeholder="xyz"
        maxLength={4}
        style={{ width: '100%', fontFamily: 'monospace' }}
      />
      <div style={{ color: valid ? '#666' : '#ff8484', fontSize: 11, marginTop: 4 }}>
        {valid ? `→ ${node.mask.length === 1 ? 'float' : 'vec' + node.mask.length}` : 'Use only x/y/z/w (1–4 chars)'}
      </div>
    </div>
  );
}

function CombineInspector({ node }: { node: CombineGraphNode }) {
  const setCombineConfig = useGraphStore((s) => s.setCombineConfig);
  const channels = ['x', 'y', 'z', 'w'];
  return (
    <div className="inspector-section">
      <div className="inspector-label">Combine arity</div>
      <select
        value={node.arity}
        onChange={(e) =>
          setCombineConfig(node.id, { arity: Number(e.target.value) as CombineArity })
        }
        style={{ width: '100%' }}
      >
        <option value={2}>2 → vec2</option>
        <option value={3}>3 → vec3</option>
        <option value={4}>4 → vec4</option>
      </select>
      {channels.slice(0, node.arity).map((c, i) => (
        <div className="inspector-row" key={c} style={{ marginTop: 6 }}>
          <span style={{ width: 12, color: '#888', fontFamily: 'monospace' }}>{c}</span>
          <input
            type="number"
            step={0.01}
            value={node.values[i]}
            onChange={(e) => {
              const next: [number, number, number, number] = [...node.values];
              next[i] = parseFloat(e.target.value);
              setCombineConfig(node.id, { values: next });
            }}
          />
        </div>
      ))}
      <div style={{ color: '#666', fontSize: 11, marginTop: 4 }}>
        Component defaults used when no input edge is connected.
      </div>
    </div>
  );
}
