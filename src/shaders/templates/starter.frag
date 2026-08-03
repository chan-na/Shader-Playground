#version 300 es
precision highp float;

// [C-7] Default template for newly created Shader nodes.
//
// A new node is always born without a mesh input, and compile.ts swaps in
// fullscreen.vert for mesh-less shader passes — and fullscreen.vert emits only
// v_uv. So this template consumes v_uv ONLY: anything reading v_normal/v_world
// (unlit.frag, which is a *mesh* shader) cannot link on a node's first frame.
// Consuming just v_uv also keeps this linking against basic.vert once the user
// does connect a mesh, since a vertex shader may emit varyings the fragment
// shader ignores — only the reverse is a link error.
//
// [Q1-b] This default output (u_baseColor central soft glow + dark vignette +
// subtle u_time modulation) is the design-canon visual for a newly created
// Shader node — promoted from "interim visual" to canon in design v1.3; the
// canonical rendition is the 'New Shader' demo card in design/Node
// Editor.dc.html. [R14] The dc CSS gradients are ported as a *recipe*, not
// stop-for-stop (visual approximation approved).

in vec2 v_uv;

uniform float u_time;
uniform vec3 u_baseColor; // @color @default 0.5, 0.7, 1.0

out vec4 outColor;

void main() {
  vec2 p = v_uv - 0.5;
  float d = length(p);
  float glow = smoothstep(0.55, 0.05, d);
  vec3 col = u_baseColor * (0.35 + 0.65 * glow);
  col += 0.05 * sin(u_time + v_uv.x * 6.283);
  // [Q1-b][R14] dark vignette — dc: inset radial transparent 52% ->
  // rgba(0,0,0,0.45) @ corner (d ~= 0.707). Recipe-level port; exact
  // CSS-stop matching is explicitly not required (visual approximation
  // approved in v1.4 R14).
  float vignette = 1.0 - 0.45 * smoothstep(0.37, 0.707, d);
  col *= vignette;
  outColor = vec4(col, 1.0);
}
