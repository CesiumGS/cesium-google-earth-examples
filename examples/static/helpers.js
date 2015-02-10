function cleanUpFunctionSource(source, endTrim) {
    endTrim = Cesium.defaultValue(endTrim, 0);
    var text = '';
    var lines = source.toString().split('\n');
    var count = lines[1].match(/^\s+/)[0].length;
    for (var i = 1; i < lines.length - (1 + endTrim) ; i++) {
        var line = lines[i];
        text += line.substring(count) + '\n';
    }
    return text.trim();
}

function showPanel(element) {
    switch (element.id) {
        case "menuPreview": {
            document.getElementById('previewContent').style.display = 'block';
            document.getElementById('czmPanel').style.display = 'none';
            document.getElementById('gePanel').style.display = 'none';
            document.getElementById('code').style.display = 'none';
            cesiumCode.refresh();
            geCode.refresh();
            break;
        }
        case "menuCesium": {
            document.getElementById('previewContent').style.display = 'none';
            document.getElementById('czmPanel').style.display = 'block';
            document.getElementById('gePanel').style.display = 'none';
            document.getElementById('code').style.display = 'block';
            cesiumCode.refresh();
            geCode.refresh();

            break;
        }
        case "menuGoogle": {
            document.getElementById('previewContent').style.display = 'none';
            document.getElementById('czmPanel').style.display = 'none';
            document.getElementById('gePanel').style.display = 'block';
            document.getElementById('code').style.display = 'block';
            cesiumCode.refresh();
            geCode.refresh();
            break;
        }
    }
    document.getElementById('navbar').classList.toggle('in');
}

function cleanUpTextAreaSource(source) {
    var text = '';
    var lines = source.toString().split('\n');
    var count = lines[0].match(/^\s+/)[0].length;
    for (var i = 0; i < lines.length; i++) {
        var line = lines[i];
        text += line.substring(count) + '\n';
    }
    return text.trim();
}

var cesiumCode;
var geCode;

function showSource(elementId, func, endTrim) {
    var cs = document.getElementById(elementId);
    cs.textContent = cleanUpFunctionSource(func, endTrim);
    cesiumCode = CodeMirror.fromTextArea(cs, {
        readOnly: true
    });
    cs.parentElement.removeChild(cs);

    var ge = document.getElementById('gesource');
    ge.textContent = cleanUpTextAreaSource(ge.textContent);
    geCode = CodeMirror.fromTextArea(ge, {
        readOnly: true
    });
    ge.parentElement.removeChild(ge);
}

var lastSize = 0;
function onResize() {
    var width = window.innerWidth;
    if (width >= 767 && lastSize < 767) {
        document.getElementById('previewContent').style.display = 'block';
        document.getElementById('czmPanel').style.display = 'block';
        document.getElementById('gePanel').style.display = 'block';
        document.getElementById('code').style.display = 'block';
    } else if (width <= 767 && lastSize > 767) {
        document.getElementById('previewContent').style.display = 'block';
        document.getElementById('czmPanel').style.display = 'none';
        document.getElementById('gePanel').style.display = 'none';
        document.getElementById('code').style.display = 'none';
    }
    lastSize = width;
}

