/**
 * Header meta-slot badge for a Webcam/Audio node whose external source is
 * stuck in a pending/denied permission state — design/System States.dc.html
 * L472's `warnBadge` ("⚠ blocked" pill, applied to nodes[0]/nodes[1] in
 * `renderVals()` when `isWebcam`/`isAudio`). Mirrors ErrorBadge.tsx's
 * presentation-only shape: the parent view (WebcamNodeView/AudioNodeView)
 * already knows the permission state from its own status poll, so this
 * component takes no props beyond the node id used for its test hook.
 */
export function BlockedBadge({ nodeId }: { nodeId: string }) {
  return (
    <div
      className="node-card__blocked-badge"
      data-testid={`node-blocked-${nodeId}`}
      title="Permission pending or denied"
    >
      ⚠ blocked
    </div>
  );
}
