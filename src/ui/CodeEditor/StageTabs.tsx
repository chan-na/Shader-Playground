import type { ShaderStage } from "../../state/editorStore";

export interface StageTabsProps {
  active: ShaderStage;
  onChange: (s: ShaderStage) => void;
  vertexHasError: boolean;
  fragmentHasError: boolean;
}

export function StageTabs({
  active,
  onChange,
  vertexHasError,
  fragmentHasError,
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
        label="vertex"
        onClick={() => onChange("vertex")}
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
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={props.onClick}
      data-testid={`stage-tab-${props.label}`}
      data-active={props.active}
      data-has-error={props.hasError}
      style={{
        background: props.active ? "#1e1e1e" : "transparent",
        border: "none",
        borderBottom: props.active
          ? "2px solid #569cd6"
          : "2px solid transparent",
        color: props.active ? "#ddd" : "#aaa",
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
