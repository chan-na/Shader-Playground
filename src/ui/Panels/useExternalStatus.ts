import { useEffect, useState } from "react";
import {
  type ExternalStatus,
  getExternalStatus,
} from "../../core/external/registry";

/**
 * Polls the external-source registry's status for `nodeId` every 500ms while
 * mounted (the registry is a plain module singleton with no subscription
 * API). Returns null until the node's handle exists. Shared by the webcam /
 * video / audio inspectors.
 */
export function useExternalStatus(nodeId: string): ExternalStatus | null {
  const [status, setStatus] = useState<ExternalStatus | null>(null);

  useEffect(() => {
    let timer: number | null = null;
    let cancelled = false;
    const tick = () => {
      if (cancelled) return;
      setStatus(getExternalStatus(nodeId));
      timer = window.setTimeout(tick, 500);
    };
    tick();
    return () => {
      cancelled = true;
      if (timer !== null) clearTimeout(timer);
    };
  }, [nodeId]);

  return status;
}
