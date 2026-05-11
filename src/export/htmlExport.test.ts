import { describe, expect, it } from 'vitest';
import { buildExportedHtml } from './htmlExport';
import type { Graph } from '../core/graph/types';

const sample: Graph = {
  nodes: [
    {
      id: 's1',
      kind: 'shader',
      vertexSource: 'void main(){ gl_Position = vec4(0); }',
      fragmentSource: '#version 300 es\nprecision highp float;\nout vec4 c;\nvoid main(){ c = vec4(1); }',
      uniformValues: { u_x: 0.5 },
    },
    { id: 'o1', kind: 'output' },
  ],
  edges: [
    { id: 'e1', source: 's1', sourceHandle: 'texture', target: 'o1', targetHandle: 'texture' },
  ],
};

describe('buildExportedHtml', () => {
  it('embeds the project JSON', () => {
    const html = buildExportedHtml(sample, {});
    expect(html).toContain('window.__SP_PROJECT');
    expect(html).toContain('"id":"s1"');
    expect(html).toContain('"kind":"output"');
  });

  it('escapes any </script> in shader source', () => {
    const sneaky: Graph = {
      nodes: [
        {
          id: 'x',
          kind: 'shader',
          vertexSource: 'void main(){}',
          // Closing-script in source MUST be escaped or it breaks the page.
          fragmentSource: '// </script><script>alert(1)</script>',
          uniformValues: {},
        },
      ],
      edges: [],
    };
    const html = buildExportedHtml(sneaky, {});
    expect(html).not.toContain('</script><script>');
    expect(html).toContain('<\\/script>');
  });

  it('inlines a non-trivial standalone player script', () => {
    const html = buildExportedHtml(sample, {});
    // The player references its public API contract — check a few unique
    // strings that prove the runtime body was inlined.
    expect(html).toContain('__SP_PROJECT');
    expect(html).toContain('requestAnimationFrame');
    expect(html).toContain('webgl2');
    expect(html.length).toBeGreaterThan(8_000);
  });

  it('emits a valid HTML5 doctype + canvas', () => {
    const html = buildExportedHtml(sample, {});
    expect(html.startsWith('<!doctype html>')).toBe(true);
    expect(html).toContain('<canvas id="canvas"');
  });
});
