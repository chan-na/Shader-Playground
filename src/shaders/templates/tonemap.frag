#version 300 es
precision highp float;

in vec2 v_uv;

uniform sampler2D u_tex;
uniform float u_exposure;
uniform float u_gamma;

out vec4 outColor;

void main() {
  vec3 col = texture(u_tex, v_uv).rgb;
  col *= u_exposure;
  col = col / (1.0 + col);
  col = pow(col, vec3(1.0 / max(u_gamma, 0.0001)));
  outColor = vec4(col, 1.0);
}
