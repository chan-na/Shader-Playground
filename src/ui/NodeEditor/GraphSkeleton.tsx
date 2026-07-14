/**
 * Graph-restore loading overlay (design/System States.dc.html L122-133,
 * "graph: SKELETON" state, M7-U1). NodeEditor mounts this instead of
 * WelcomeOverlay while bootstrapStore's phase isn't yet "done" — i.e. while
 * BootstrapGate is still deciding whether a saved session, a share-link
 * graph, or the first-run demo/prompt should populate the graph. Without it
 * the empty graph (0 nodes, same as the real first-run state) would flash
 * WelcomeOverlay for a frame before the restored graph replaces it.
 *
 * Purely presentational — three fixed node-card placeholders (positions
 * lifted from the dc mock's `skeletonNodes` renderVals) plus a status row,
 * all absolutely positioned like WelcomeOverlay/the selection-count-badge in
 * the same `.panel-body` slot. `pointer-events: none` since there's nothing
 * to interact with and the real ReactFlow pane sits right behind it.
 */

const SKELETON_CARDS: ReadonlyArray<{ id: string; left: number; top: number }> =
  [
    { id: "a", left: 40, top: 40 },
    { id: "b", left: 270, top: 120 },
    { id: "c", left: 500, top: 70 },
  ];

export function GraphSkeleton() {
  return (
    <div className="graph-skeleton" data-testid="graph-skeleton">
      {SKELETON_CARDS.map((card) => (
        <div
          key={card.id}
          className="graph-skeleton-card"
          style={{ left: card.left, top: card.top }}
        >
          <div className="graph-skeleton-card-header sp-shimmer" />
          <div className="graph-skeleton-card-body">
            <div className="graph-skeleton-card-block sp-shimmer" />
          </div>
        </div>
      ))}
      <div className="graph-skeleton-status">
        <span className="graph-skeleton-spinner" aria-hidden="true" />
        Restoring graph…
      </div>
    </div>
  );
}
