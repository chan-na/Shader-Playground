import { PORT_TOP_PAD, PortHandle } from "./PortHandle";

export function OutputNodeView() {
  return (
    <div className="node-card" style={{ position: "relative", minWidth: 132 }}>
      <div className="node-card__header node-card__header--output">Output</div>
      <div className="node-card__body" style={{ paddingLeft: 22 }}>
        <div className="node-card__meta">→ Canvas</div>
      </div>
      <PortHandle
        port={{ name: "texture", type: "texture" }}
        side="in"
        top={PORT_TOP_PAD}
      />
    </div>
  );
}
