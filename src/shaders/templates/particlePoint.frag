#version 300 es
precision highp float;

in vec3 v_localPos;

uniform vec3 u_tint;  // @color @default 0.4,0.8,1.0

out vec4 outColor;

void main() {
  // Soft circular point: discard fragments outside a unit circle in gl_PointCoord.
  vec2 uv = gl_PointCoord * 2.0 - 1.0;
  float d = dot(uv, uv);
  if (d > 1.0) discard;
  float a = 1.0 - smoothstep(0.6, 1.0, d);
  vec3 col = u_tint * (0.4 + 0.6 * length(v_localPos));
  outColor = vec4(col, a);
}
