import { useRendererStore } from '../../state/rendererStore';

export function CodeEditor() {
  const fps = useRendererStore((s) => s.stats.fps);
  const errors = useRendererStore((s) => s.stats.errors);

  return (
    <div className="panel panel--code">
      <div className="panel-header">Code · {fps} fps</div>
      <div className="panel-body">
        <div className="placeholder-message">
          {errors.length > 0
            ? errors.join(' | ')
            : 'Code editor (Phase 3)'}
        </div>
      </div>
    </div>
  );
}
