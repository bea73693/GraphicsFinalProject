#version 300 es
precision mediump float;
uniform mat4 mv;
uniform mat4 proj;

in vec4 vPosition;
in vec4 vNormal;
in vec4 vColor;
out vec4 color;

void main(){
    gl_Position = proj*mv*vPosition;
    gl_PointSize = 1.0;
    //as a last ditch debugging strategy we can treat any vector as a color vector.
    //red is our x coordinate, green is our y coordinate, blue is our z coordinate
    color = vColor; //Normal vector has w coordinate of 0
    color.a = 1.0;
    //color = vPosition ;

}