#version 300 es
precision highp float;

uniform float u_time;
uniform vec2 u_resolution;

out vec4 outColor;

void main() {
  vec2 uv = gl_FragCoord.xy / u_resolution.xy;
  vec3 col = 0.5 + 0.5 * cos(u_time + uv.xyx + vec3(0.0, 2.0, 4.0));
  outColor = vec4(col, 1.0);
}
