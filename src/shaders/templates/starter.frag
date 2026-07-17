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

in vec2 v_uv;

uniform float u_time;
uniform vec3 u_baseColor;

out vec4 outColor;

void main() {
  vec2 p = v_uv - 0.5;
  float glow = smoothstep(0.55, 0.05, length(p));
  vec3 col = u_baseColor * (0.35 + 0.65 * glow);
  col += 0.05 * sin(u_time + v_uv.x * 6.283);
  outColor = vec4(col, 1.0);
}
