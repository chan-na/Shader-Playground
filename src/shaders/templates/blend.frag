#version 300 es
precision highp float;

in vec2 v_uv;

uniform sampler2D u_a;
uniform sampler2D u_b;
// @range 0..1 @step 0.001 @default 0.5 @label "Mix"
uniform float u_mix;
// 0=mix, 1=add, 2=multiply, 3=screen
// @range 0..3 @step 1 @default 0 @label "Mode"
uniform float u_mode;

out vec4 outColor;

void main() {
  vec3 a = texture(u_a, v_uv).rgb;
  vec3 b = texture(u_b, v_uv).rgb;
  vec3 col;
  int mode = int(u_mode + 0.5);
  if (mode == 1) {
    col = a + b * u_mix;
  } else if (mode == 2) {
    col = mix(a, a * b, u_mix);
  } else if (mode == 3) {
    col = mix(a, 1.0 - (1.0 - a) * (1.0 - b), u_mix);
  } else {
    col = mix(a, b, u_mix);
  }
  outColor = vec4(col, 1.0);
}
