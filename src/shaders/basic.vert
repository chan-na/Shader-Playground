#version 300 es
precision highp float;

in vec3 a_position;
in vec3 a_normal;
in vec2 a_uv;

uniform mat4 u_view;
uniform mat4 u_proj;
uniform mat4 u_model;

out vec3 v_normal;
out vec2 v_uv;
out vec3 v_world;

void main() {
  vec4 world = u_model * vec4(a_position, 1.0);
  v_world = world.xyz;
  v_normal = mat3(u_model) * a_normal;
  v_uv = a_uv;
  gl_Position = u_proj * u_view * world;
}
