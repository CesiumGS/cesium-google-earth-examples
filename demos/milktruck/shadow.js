// milktruck.js

var Shadow = function(width, height) {
    this._width = width;
    this._height = height;
    
    this._positionBuffer = undefined;
    
    this._rs = undefined;
    this._va = undefined;
    this._sp = undefined;
    
    this._command = undefined;
};

Shadow.prototype.updatePositions = function(position, frame, scene, globe, ellipsoid) {
    //var frame = Cesium.Transforms.eastNorthUpToFixedFrame(position, ellipsoid);
    var east = Cesium.Cartesian3.fromCartesian4(Cesium.Matrix4.getColumn(frame, 0, new Cesium.Cartesian4()));
    var north = Cesium.Cartesian3.fromCartesian4(Cesium.Matrix4.getColumn(frame, 1, new Cesium.Cartesian4()));
    
    Cesium.Cartesian3.multiplyByScalar(east, this._width * 0.5, east);
    Cesium.Cartesian3.multiplyByScalar(north, this._height * 0.5, north);
    
    var northeast = Cesium.Cartesian3.add(position, east, new Cesium.Cartesian3());
    Cesium.Cartesian3.add(northeast, north, northeast);
    var northwest = Cesium.Cartesian3.subtract(position, east, new Cesium.Cartesian3());
    Cesium.Cartesian3.add(northwest, north, northwest);
    var southeast = Cesium.Cartesian3.subtract(position, north, new Cesium.Cartesian3());
    Cesium.Cartesian3.add(southeast, east, southeast);
    var southwest = Cesium.Cartesian3.subtract(position, north, new Cesium.Cartesian3());
    Cesium.Cartesian3.subtract(southwest, east, southwest);
    
    function scaleToTerrain(pos) {
        var lla = globe.ellipsoid.cartesianToCartographic(pos);
        lla.height = Cesium.defaultValue(globe.getHeight(lla), 0.0) + 0.05;
        globe.ellipsoid.cartographicToCartesian(lla, pos);
    }
    
    scaleToTerrain(southwest);
    scaleToTerrain(southeast);
    scaleToTerrain(northeast);
    scaleToTerrain(northwest);
    
    var components = new Float32Array(6 * 4);
    Cesium.EncodedCartesian3.writeElements(southwest, components, 0);
    Cesium.EncodedCartesian3.writeElements(southeast, components, 6);
    Cesium.EncodedCartesian3.writeElements(northeast, components, 12);
    Cesium.EncodedCartesian3.writeElements(northwest, components, 18);
    
    this._positionBuffer.copyFromArrayView(components);
};

var attributeLocations = {
    positionHigh : 0,
    positionLow : 1,
    textureCoordinates : 2
};

Shadow.prototype.update = function(frameState) {
    var context = frameState.context;
    var commandList = frameState.commandList;
    var pass = frameState.passes;
    if (!pass.render) {
        return;
    }
    
    if (!Cesium.defined(this._rs)) {
        this._rs = Cesium.RenderState.fromCache({
            blending : Cesium.BlendingState.ALPHA_BLEND,
            depthTest : {
                enabled : true
            },
            cull : {
                enabled : true,
                face : Cesium.CullFace.BACK
            }
        });
    }
    
    if (!Cesium.defined(this._va)) {
        var size = 4 * 2 * 3 * Cesium.ComponentDatatype.getSizeInBytes(Cesium.ComponentDatatype.FLOAT);
        var usage = Cesium.BufferUsage.DYNAMIC_DRAW;
        var positionBuffer = this._positionBuffer = Cesium.Buffer.createVertexBuffer({
            context: context,
            sizeInBytes: size,
            usage: usage
        });
        
        usage = Cesium.BufferUsage.STATIC_DRAW;
        var textureCoordinateBuffer = Cesium.Buffer.createVertexBuffer({
            context: context,
            typedArray: new Float32Array([0.0, 0.0, 1.0, 0.0, 1.0, 1.0, 0.0, 1.0]),
            usage: usage
        });
        
        var indexBuffer = Cesium.Buffer.createIndexBuffer({
            context: context,
            typedArray: new Uint16Array([0, 1, 2, 0, 2, 3]),
            usage: Cesium.BufferUsage.STATIC_DRAW,
            indexDatatype: Cesium.IndexDatatype.UNSIGNED_SHORT
        });
        
        var attributes = [{
            index                  : attributeLocations.positionHigh,
            vertexBuffer           : positionBuffer,
            componentsPerAttribute : 3,
            componentDatatype      : Cesium.ComponentDatatype.FLOAT,
            offsetInBytes          : 0,
            strideInBytes          : Cesium.ComponentDatatype.getSizeInBytes(Cesium.ComponentDatatype.FLOAT) * 3 * 2
        }, {
            index                  : attributeLocations.positionLow,
            vertexBuffer           : positionBuffer,
            componentsPerAttribute : 3,
            componentDatatype      : Cesium.ComponentDatatype.FLOAT,
            offsetInBytes          : Cesium.ComponentDatatype.getSizeInBytes(Cesium.ComponentDatatype.FLOAT) * 3,
            strideInBytes          : Cesium.ComponentDatatype.getSizeInBytes(Cesium.ComponentDatatype.FLOAT) * 3 * 2
        }, {
            index                  : attributeLocations.textureCoordinates,
            vertexBuffer           : textureCoordinateBuffer,
            componentsPerAttribute : 2,
            componentDatatype      : Cesium.ComponentDatatype.FLOAT
        }];
        
        this._va = new Cesium.VertexArray({
            context: context,
            attributes: attributes,
            indexBuffer: indexBuffer
        });
    }

    if (!Cesium.defined(this._sp)) {
        var vs = 
            'attribute vec3 positionHigh;\n' +
            'attribute vec3 positionLow;\n' +
            'attribute vec4 position;\n' +
            'attribute vec2 textureCoordinates;\n' +
            'varying vec2 v_textureCoordinates;\n' +
            'void main() {\n' +
            '    v_textureCoordinates = textureCoordinates;\n' +
            '    gl_Position = czm_modelViewProjectionRelativeToEye * czm_translateRelativeToEye(positionHigh, positionLow);\n' + 
            '}\n';
        
        var fs = 
            'varying vec2 v_textureCoordinates;\n' +
            'void main() {\n' +
            '    gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0 - smoothstep(0.3, 0.5, length(v_textureCoordinates - vec2(0.5))));\n' +
            '}\n';
        
        this._sp = Cesium.ShaderProgram.fromCache({
            context: context,
            vertexShaderSource : vs,
            fragmentShaderSource : fs,
            attributeLocations: attributeLocations
        });
    }
    
    if (!Cesium.defined(this._command)) {
        this._command = new Cesium.DrawCommand({
            primitiveType : Cesium.PrimitiveType.TRIANGLES,
            vertexArray : this._va,
            renderState : this._rs,
            shaderProgram : this._sp,
            owner : this,
            modelMatrix : Cesium.Matrix4.IDENTITY,
            pass : Cesium.Pass.TRANSLUCENT
        });
    }
    
    commandList.push(this._command);
};

Shadow.prototype.isDestroyed = function() {
    return false;
};

Shadow.prototype.destroy = function() {
    return Cesium.destroyObject(this);
};
