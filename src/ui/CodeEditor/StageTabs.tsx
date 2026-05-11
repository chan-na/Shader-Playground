import type { ShaderStage } from "../../state/editorStore";

export interface StageTabsProps {
  active: ShaderStage;
  onChange: (s: ShaderStage) => void;
  vertexHasError: boolean;
  fragmentHasError: boolean;
  vertexDimmed?: boolean;
}

export function StageTabs({
  active,
  onChange,
  vertexHasError,
  fragmentHasError,
  vertexDimmed,
}: StageTabsProps) {
  return (
    <div
      style={{
        display: "flex",
        borderBottom: "1px solid #1a1a1a",
        background: "#252526",
      }}
    >
      <Tab
        active={active === "vertex"}
        hasError={vertexHasError}
        dimmed={vertexDimmed ?? false}
        label="vertex"
        onClick={() => onChange("vertex")}
        {...(vertexDimmed && {
          title:
            "Vertex shader is overridden by fullscreen quad (no mesh input)",
        })}
      />
      <Tab
        active={active === "fragment"}
        hasError={fragmentHasError}
        label="fragment"
        onClick={() => onChange("fragment")}
      />
    </div>
  );
}

function Tab(props: {
  active: boolean;
  hasError: boolean;
  dimmed?: boolean;
  label: string;
  onClick: () => void;
  title?: string;
}) {
  return (
    <button
      type="button"
      onClick={props.onClick}
      title={props.title}
      style={{
        background: props.active ? "#1e1e1e" : "transparent",
        border: "none",
        borderBottom: props.active
          ? "2px solid #569cd6"
          : "2px solid transparent",
        color: props.dimmed ? "#777" : props.active ? "#ddd" : "#aaa",
        padding: "6px 14px",
        cursor: "pointer",
        fontSize: 11,
        textTransform: "uppercase",
        letterSpacing: 0.5,
        display: "flex",
        alignItems: "center",
        gap: 6,
        position: "relative",
      }}
    >
      {props.label}
      {props.hasError && (
        <span
          style={{
            width: 6,
            height: 6,
            borderRadius: "50%",
            background: "#f48771",
          }}
        />
      )}
    </button>
  );
}
