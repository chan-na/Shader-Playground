#version 300 es
precision highp float;

in vec2 v_uv;

uniform float u_time;
uniform float u_scale;
uniform vec3 u_tint;

out vec4 outColor;

float hash(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  float a = hash(i);
  float b = hash(i + vec2(1.0, 0.0));
  float c = hash(i + vec2(0.0, 1.0));
  float d = hash(i + vec2(1.0, 1.0));
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}

void main() {
  vec2 uv = v_uv;
  float t = u_time * 0.3;
  float n = 0.0;
  float amp = 0.5;
  vec2 p = uv * u_scale + vec2(t, t * 0.7);
  for (int i = 0; i < 4; i++) {
    n += amp * noise(p);
    p *= 2.0;
    amp *= 0.5;
  }
  vec3 col = u_tint * n + 0.1;
  outColor = vec4(col, 1.0);
}
