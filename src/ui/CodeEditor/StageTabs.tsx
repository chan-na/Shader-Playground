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
    <div className="stage-tabs">
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
      className={props.active ? "stage-tab stage-tab--active" : "stage-tab"}
    >
      {props.label}
      {props.hasError && <span className="stage-tab-error-dot" />}
    </button>
  );
}
