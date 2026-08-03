import type { ShaderStage } from "../../state/editorStore";

export interface StageTabsProps {
  active: ShaderStage;
  onChange: (s: ShaderStage) => void;
  vertexHasError: boolean;
  fragmentHasError: boolean;
  /**
   * True when the selected node's mesh input didn't resolve and the
   * compiler substituted fullscreen.vert for its vertex stage (A-1,
   * passPlanStore.fullscreenByNode). Swaps the vertex tab's label to name
   * the source that's actually compiled, instead of implying a
   * `vertex.glsl` document that isn't the one running.
   */
  vertexAuto?: boolean;
}

export function StageTabs({
  active,
  onChange,
  vertexHasError,
  fragmentHasError,
  vertexAuto = false,
}: StageTabsProps) {
  return (
    <div className="stage-tabs">
      <Tab
        active={active === "vertex"}
        hasError={vertexHasError}
        stage="vertex"
        label={vertexAuto ? "fullscreen.vert (auto)" : "vertex.glsl"}
        auto={vertexAuto}
        onClick={() => onChange("vertex")}
      />
      <Tab
        active={active === "fragment"}
        hasError={fragmentHasError}
        stage="fragment"
        label="fragment.glsl"
        onClick={() => onChange("fragment")}
      />
    </div>
  );
}

function Tab(props: {
  active: boolean;
  hasError: boolean;
  stage: ShaderStage;
  label: string;
  /** Only ever passed for the vertex tab — see the `data-auto` E2E anchor
   * rendered below, which is likewise vertex-only (the fragment tab has no
   * auto-substitution and stays exactly as it was). */
  auto?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={props.onClick}
      data-testid={`stage-tab-${props.stage}`}
      data-active={props.active}
      data-has-error={props.hasError}
      {...(props.stage === "vertex"
        ? { "data-auto": props.auto ?? false }
        : {})}
      className={props.active ? "stage-tab stage-tab--active" : "stage-tab"}
    >
      {props.label}
      {props.hasError && <span className="stage-tab-error-dot" />}
    </button>
  );
}
