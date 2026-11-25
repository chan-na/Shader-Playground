/**
 * Browser download helpers — the single home for the
 * `<a download>` click sequence the toolbar, Viewport snapshot, HTML export
 * and Export & Share dialog all share.
 */

/** Delay before the object URL is revoked — long enough for the browser to
 * start the download it was handed. */
const REVOKE_DELAY_MS = 1000;

/** Click a detached `<a download>` pointing at `href`. Does not create or
 * revoke anything — the caller owns `href`'s lifetime. */
export function triggerDownload(href: string, fileName: string): void {
  const a = document.createElement("a");
  a.href = href;
  a.download = fileName;
  a.click();
}

/** Download `blob` as `fileName` through a temporary object URL, revoked
 * shortly after the click. */
export function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  triggerDownload(url, fileName);
  setTimeout(() => URL.revokeObjectURL(url), REVOKE_DELAY_MS);
}
