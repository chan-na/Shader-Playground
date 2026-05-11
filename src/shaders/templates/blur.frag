#version 300 es
precision highp float;

uniform sampler2D u_tex;
uniform vec2 u_resolution;
uniform float u_radius;

out vec4 outColor;

void main() {
  vec2 uv = gl_FragCoord.xy / u_resolution.xy;
  vec2 px = u_radius / u_resolution.xy;
  vec3 acc = vec3(0.0);
  float w = 0.0;
  for (int y = -2; y <= 2; y++) {
    for (int x = -2; x <= 2; x++) {
      vec2 o = vec2(float(x), float(y)) * px;
      acc += texture(u_tex, uv + o).rgb;
      w += 1.0;
    }
  }
  outColor = vec4(acc / w, 1.0);
}
