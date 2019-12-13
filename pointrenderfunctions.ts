import {initFileShaders, vec4, mat4, flatten, perspective, lookAt, rotateX, rotateY, rotateZ, translate} from "./helperfunctions.js";

"use strict";
let gl:WebGLRenderingContext;
let program:WebGLProgram;

//uniform locations
let umv:WebGLUniformLocation; //uniform for mv matrix
let uproj:WebGLUniformLocation; //uniform for projection matrix

//matrices
let mv:mat4; //local mv
let p:mat4; //local projection

//document elements
let canvas:HTMLCanvasElement;

//interaction and rotation state
let xAngle:number;
let yAngle:number;
let mouse_button_down:boolean = false;
let prevMouseX:number = 0;
let prevMouseY:number = 0;

//mesh vars
let meshVertexBufferID:WebGLBuffer;
let indexBufferID:WebGLBuffer;

let meshVertexData:vec4[];
let indexData:number[];

let anisotropic_ext;
let uTextureSampler:WebGLUniformLocation;
let blur1tex:WebGLTexture;
let blur1image:HTMLImageElement;

window.onload = function init() {

    canvas = document.getElementById("gl-canvas") as HTMLCanvasElement;
    gl = canvas.getContext('webgl2') as WebGLRenderingContext;
    if (!gl) {
        alert("WebGL isn't available");
    }

    program = initFileShaders(gl, "vshader.glsl", "fshader.glsl");
    gl.useProgram(program);

    ///////////////////////////////////////////////////////
    ///////////////////////////////////////////////////////
    //https://codepen.io/matt-west/pen/KjEHg
    //converted to typescript by Nathan Gossett
    let fileInput:HTMLInputElement = document.getElementById("fileInput") as HTMLInputElement;
    fileInput.addEventListener('change', function(e){
        let file:File = fileInput.files[0];
        let textType:RegExp = /.*/;
        if(file.type.match(textType)){
            let reader:FileReader = new FileReader();
            reader.onload = function(e){
                createMesh(reader.result as string); //ok, we have our data, so parse it
                requestAnimationFrame(render); //ask for a new frame
            };
            reader.readAsText(file);
        }else{
            alert("File not supported: " + file.type + ".");
        }
    });
    ////////////////////////////////////////////////////////
    ////////////////////////////////////////////////////////

    //allow the user to rotate mesh with the mouse
    canvas.addEventListener("mousedown", mouse_down);
    canvas.addEventListener("mousemove", mouse_drag);
    canvas.addEventListener("mouseup", mouse_up);

    //start as blank arrays
    meshVertexData = [];
    indexData = [];

    //black background
    gl.clearColor(0.0, 0.0, 0.0, 1.0);
    gl.enable(gl.DEPTH_TEST);
    gl.enable(gl.BLEND);

    umv = gl.getUniformLocation(program, "mv");
    uproj = gl.getUniformLocation(program, "proj");
    uTextureSampler = gl.getUniformLocation(program, "textureSampler");

    //set up basic perspective viewing
    gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
    p = perspective(60, (canvas.clientWidth / canvas.clientHeight), 5, 500);
    gl.uniformMatrix4fv(uproj, false, p.flatten());

    initTextures();
    //initialize rotation angles
    xAngle = 0;
    yAngle = 0;

};

function initTextures(){
    anisotropic_ext = gl.getExtension('EXT_texture_filter_anisotropic');
    blur1tex = gl.createTexture();
    blur1image = new Image();
    blur1image.onload = function() { handleTextureLoaded(blur1image, blur1tex);};
    blur1image.src = 'blur1.png'
}

function handleTextureLoaded(image:HTMLImageElement, texture:WebGLTexture){
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);  //disagreement over what direction Y axis goes
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
    gl.generateMipmap(gl.TEXTURE_2D);

    //gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    //gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);

    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    gl.texParameterf(gl.TEXTURE_2D, anisotropic_ext.TEXTURE_MAX_ANISOTROPY_EXT, 4);
    gl.bindTexture(gl.TEXTURE_2D, null);
}

/**
 * Parse string into list of vertices and triangles
 * Not robust at all, but simple enough to follow as an introduction
 * @param input string of ascii floats
 */
function createMesh(input:string){
    let numbers:string[] = input.split(/\s+/); //split on white space
    let numVerts:GLint = parseInt(numbers[0]); //first element is number of vertices
    let numTris:GLint = parseInt(numbers[1]); //second element is number of triangles
    let positionData:vec4[] = [];
    let colorData:vec4[] = [];
    console.log(parseInt(numbers[0]));
    console.log(parseInt(numbers[1]));


    //three numbers at a time for xyz
    for(let i:number = 2; i < 6*numVerts + 5; i+= 6){
        if(isNaN(parseInt(numbers[i])) || isNaN(parseInt(numbers[i+1])) ||  isNaN(parseInt(numbers[i+1])) ||  isNaN(parseInt(numbers[i+2]))
            ||  isNaN(parseInt(numbers[i+3])) ||  isNaN(parseInt(numbers[i+4])) ||  isNaN(parseInt(numbers[i+5]))){
            console.log("IS NAN " + i + " " + numbers[i]);
        }
        positionData.push(new vec4(parseFloat(numbers[i]), parseFloat(numbers[i+1]), parseFloat(numbers[i+2]), 1));
        colorData.push(new vec4(parseInt(numbers[i+3])/225.0, parseInt(numbers[i+4])/225.0, parseInt(numbers[i+5])/225.0));
    }
    console.log("DONE");

    //now the triangles
    indexData = []; //empty out any previous data
    //three vertex indices per triangle
    for(let i:number = 6*numVerts + 5; i < numbers.length; i+=4){
        indexData.push(parseInt(numbers[i+1]));
        indexData.push(parseInt(numbers[i+2]));
        indexData.push(parseInt(numbers[i+3]));
    }

    let normalVectors:vec4[] = [];

    //at first, we have no normal vectors
    for(let i:number = 0; i < positionData.length; i++){
        normalVectors.push(new vec4(0,0,0,0));
    }

    //We need to calculate normal vectors for each triangle
    for(let i:number = 0; i < indexData.length; i += 3) {
        let triLeg1:vec4;
        let triLeg2:vec4;

        //make sure all points are different
        if(!(positionData[indexData[i]] == positionData[indexData[i+1]] || positionData[indexData[i]] == positionData[indexData[i+2]] ||
            positionData[indexData[i+1]] == positionData[indexData[i+2]])) {
            //direction from vertex 0 to vertex 1
            triLeg1 = positionData[indexData[i + 1]].subtract(positionData[indexData[i]]).normalize();
            //direction from vertex 0 to vertex 2
            triLeg2 = positionData[indexData[i + 2]].subtract(positionData[indexData[i]]).normalize();
            //get a vector perpendicular to both triangle sides

            let triNormal: vec4;

            triNormal = triLeg1.cross(triLeg2).normalize();

            //and add that on to the totals for all three vertices involved in this triangle
            normalVectors[indexData[i]] = normalVectors[indexData[i]].add(triNormal);
            normalVectors[indexData[i + 1]] = normalVectors[indexData[i + 1]].add(triNormal);
            normalVectors[indexData[i + 2]] = normalVectors[indexData[i + 2]].add(triNormal);
        }
    }


    //at this point, every vertex normal is the sum of all the normal vectors of the triangles that meet up at that vertex
    //so normalize to get a unit length average normal direction for the vertex
    for(let i:number = 0; i < normalVectors.length; i++){
        normalVectors[i] = normalVectors[i].normalize();
    }

    meshVertexData = [];
    for(let i:number = 0; i < positionData.length; i++){
        meshVertexData.push(positionData[i]);
        meshVertexData.push(colorData[i]);
        meshVertexData.push(normalVectors[i]);
    }


    //buffer vertex data and enable vPosition attribute
    meshVertexBufferID = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, meshVertexBufferID);
    gl.bufferData(gl.ARRAY_BUFFER, flatten(meshVertexData), gl.STATIC_DRAW);

    let vPosition:GLint = gl.getAttribLocation(program, "vPosition");
    gl.vertexAttribPointer(vPosition, 4, gl.FLOAT, false, 48, 0); //stride is 32 bytes total for position, normal
    gl.enableVertexAttribArray(vPosition);

    let vColor:GLint = gl.getAttribLocation(program, "vColor");
    gl.vertexAttribPointer(vColor, 4, gl.FLOAT, false, 48, 16); //stride is 32 bytes total for position, normal
    gl.enableVertexAttribArray(vColor);

    let vNormal:GLint = gl.getAttribLocation(program, "vNormal");
    gl.vertexAttribPointer(vNormal, 4, gl.FLOAT, false, 48, 32);
    gl.enableVertexAttribArray(vNormal);


    indexBufferID = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBufferID);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint32Array(indexData), gl.STATIC_DRAW);
}

//update rotation angles based on mouse movement
function mouse_drag(event:MouseEvent){
    let thetaY:number, thetaX:number;
    if (mouse_button_down) {
        thetaY = 360.0 *(event.clientX-prevMouseX)/canvas.clientWidth;
        thetaX = 360.0 *(event.clientY-prevMouseY)/canvas.clientHeight;
        prevMouseX = event.clientX;
        prevMouseY = event.clientY;
        xAngle += thetaX;
        yAngle += thetaY;
    }
    requestAnimationFrame(render);
}

//record that the mouse button is now down
function mouse_down(event:MouseEvent) {
    //establish point of reference for dragging mouse in window
    mouse_button_down = true;
    prevMouseX= event.clientX;
    prevMouseY = event.clientY;
    requestAnimationFrame(render);
}

//record that the mouse button is now up, so don't respond to mouse movements
function mouse_up(){
    mouse_button_down = false;
    requestAnimationFrame(render);
}

//draw a frame
function render(){
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    mv = lookAt(new vec4(0, 0, 100, 1), new vec4(0, 0, 0, 1), new vec4(0, 1, 0, 0));
    mv = mv.mult(rotateY(yAngle).mult(rotateX(xAngle)));
    mv = mv.mult(translate(0, 100, 0));
    gl.uniformMatrix4fv(umv, false, mv.flatten());

    if(meshVertexData.length > 0) {
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBufferID);
        //note that we're using gl.drawElements() here instead of drawArrays()
        //this allows us to make use of shared vertices between triangles without
        //having to repeat the vertex data.  However, if each vertex has additional
        //attributes like color, normal vector, texture coordinates, etc that are not
        //shared between triangles like position is, than this might cause problems

        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, blur1tex);
        gl.uniform1i(uTextureSampler, 0);


        gl.drawElements(gl.POINTS, indexData.length, gl.UNSIGNED_INT, 0);
        console.log("DRAW CALL");
    }
}