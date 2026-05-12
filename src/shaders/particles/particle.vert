#version 300 es
precision highp float;

in vec3 a_position;
in vec3 a_velocity;

out vec3 v_position;
out vec3 v_velocity;

uniform float u_time;
uniform float u_dt;        // @range 0..0.05 @default 0.016
uniform float u_strength;  // @range 0..2 @default 0.6

// Simple swirling velocity field driven by sin/cos of position + time.
vec3 field(vec3 p, float t) {
  return vec3(
    sin(p.y * 1.5 + t),
    sin(p.z * 1.5 + t * 1.3),
    sin(p.x * 1.5 + t * 0.7)
  );
}

void main() {
  vec3 acc = field(a_position, u_time) * u_strength;
  vec3 vel = a_velocity * 0.92 + acc * u_dt;
  vec3 pos = a_position + vel * u_dt;

  // Soft sphere boundary: pull back toward origin if outside radius 1.4.
  float r = length(pos);
  if (r > 1.4) {
    pos = pos * (1.4 / r);
    vel = vel * -0.5;
  }

  v_position = pos;
  v_velocity = vel;
}
