#version 300 es
precision highp float;

in vec3 v_normal;
in vec2 v_uv;

uniform float u_time;
uniform vec3 u_baseColor;

out vec4 outColor;

void main() {
  vec3 n = normalize(v_normal);
  float ndl = max(dot(n, normalize(vec3(0.4, 0.8, 0.5))), 0.0);
  vec3 base = u_baseColor;
  vec3 col = base * (0.25 + 0.75 * ndl);
  col += 0.05 * sin(u_time + v_uv.x * 6.283);
  outColor = vec4(col, 1.0);
}
