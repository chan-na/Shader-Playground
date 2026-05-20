#version 300 es
precision highp float;

in vec2 v_uv;

uniform sampler2D u_a;
uniform sampler2D u_b;
uniform sampler2D u_c;
// @range 0..1 @step 0.001 @default 0.333 @label "Weight A"
uniform float u_wa;
// @range 0..1 @step 0.001 @default 0.333 @label "Weight B"
uniform float u_wb;
// @range 0..1 @step 0.001 @default 0.334 @label "Weight C"
uniform float u_wc;

out vec4 outColor;

void main() {
  vec3 a = texture(u_a, v_uv).rgb;
  vec3 b = texture(u_b, v_uv).rgb;
  vec3 c = texture(u_c, v_uv).rgb;
  float sum = max(u_wa + u_wb + u_wc, 1e-4);
  vec3 col = (a * u_wa + b * u_wb + c * u_wc) / sum;
  outColor = vec4(col, 1.0);
}
