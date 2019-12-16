#version 300 es
precision mediump float;
uniform mat4 mv;
uniform mat4 proj;
uniform sampler2D textureSampler;
uniform int squaresActive;


in vec4 vPosition;
in vec4 vSquarePosition;
in vec2 texCoord;
in vec4 vNormal;
in vec4 vColor;
in vec4 vSquareColor;
out vec4 color;

void main(){
    gl_PointSize = 1.0;

    //squares
    if(squaresActive == 1){
        gl_Position = proj*mv*vSquarePosition;
        color = vSquareColor;
        color.a = texture(textureSampler, texCoord).a;
    }
    else{
        gl_Position = proj*mv*vPosition;
        color = vColor;
        color.a = 1.0;
    }

}
