#version 300 es
precision highp float;

in vec2 v_uv;

uniform sampler2D u_base;
uniform sampler2D u_overlay;
uniform sampler2D u_mask;
// @range 0..1 @step 0.001 @default 1 @label "Strength"
uniform float u_strength;

out vec4 outColor;

void main() {
  vec3 base = texture(u_base, v_uv).rgb;
  vec3 overlay = texture(u_overlay, v_uv).rgb;
  float m = texture(u_mask, v_uv).r * u_strength;
  outColor = vec4(mix(base, overlay, m), 1.0);
}
