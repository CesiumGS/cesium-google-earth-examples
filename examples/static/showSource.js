function showSource(elementId, func, endTrim) {
    endTrim = Cesium.defaultValue(endTrim, 0);
    var text = '';
    var lines = func.toString().split('\n');
    var count = lines[1].match(/^\s+/)[0].length;
    for (var i = 1; i < lines.length - (1 + endTrim); i++) {
        var line = lines[i];
        text += line.substring(count) + '\n';
    }
    document.getElementById(elementId).textContent = text;
}