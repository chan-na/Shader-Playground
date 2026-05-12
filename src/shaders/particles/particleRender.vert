#version 300 es
precision highp float;

in vec3 a_position;

uniform mat4 u_view;
uniform mat4 u_proj;
uniform mat4 u_model;

out vec3 v_localPos;

void main() {
  v_localPos = a_position;
  gl_Position = u_proj * u_view * u_model * vec4(a_position, 1.0);
  gl_PointSize = 4.0;
}
