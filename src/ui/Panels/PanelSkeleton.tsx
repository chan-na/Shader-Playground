/**
 * Side-panel loading placeholder (design/System States.dc.html L332-341,
 * "panel: SKELETON" state, M7-U1). SidePanel mounts this in place of
 * Inspector/AssetBrowser/ProblemsPanel while bootstrapStore's phase isn't
 * yet "done" — the fields those panels would show (uniforms, assets,
 * diagnostics) don't exist until the restored/demo graph lands, so this
 * fills the wait with generic label+field rows instead of an empty panel.
 *
 * Row label widths are lifted verbatim from the dc mock's `skelRows`
 * renderVals (60/44/72/52px) — arbitrary but matches the reference exactly.
 */

const SKELETON_ROWS: ReadonlyArray<{ id: string; labelWidth: number }> = [
  { id: "a", labelWidth: 60 },
  { id: "b", labelWidth: 44 },
  { id: "c", labelWidth: 72 },
  { id: "d", labelWidth: 52 },
];

export function PanelSkeleton() {
  return (
    <div className="panel-skeleton" data-testid="panel-skeleton">
      {SKELETON_ROWS.map((row) => (
        <div key={row.id} className="panel-skeleton-row">
          <div
            className="panel-skeleton-label sp-shimmer"
            style={{ width: row.labelWidth }}
          />
          <div className="panel-skeleton-field sp-shimmer" />
        </div>
      ))}
    </div>
  );
}
