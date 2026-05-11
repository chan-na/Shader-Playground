import { useEffect, useRef } from 'react';
import { thumbnailScheduler } from '../../state/thumbnailScheduler';
import { THUMB_SIZE } from '../../core/thumbnail/readback';

export interface NodeThumbnailProps {
  nodeId: string;
  width?: number;
  height?: number;
}

export function NodeThumbnail({ nodeId, width = 96, height = 96 }: NodeThumbnailProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.width = THUMB_SIZE;
    canvas.height = THUMB_SIZE;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const stop = thumbnailScheduler.subscribe(nodeId, (img) => {
      ctx.putImageData(img, 0, 0);
    });

    // Visibility via IntersectionObserver
    const obs = new IntersectionObserver(
      (entries) => {
        for (const e of entries) thumbnailScheduler.setVisibility(nodeId, e.isIntersecting);
      },
      { threshold: 0 },
    );
    obs.observe(canvas);

    return () => {
      stop();
      obs.disconnect();
    };
  }, [nodeId]);

  return (
    <canvas
      ref={canvasRef}
      style={{
        width,
        height,
        display: 'block',
        background: '#0a0a0a',
        imageRendering: 'pixelated',
        borderRadius: 3,
      }}
    />
  );
}
