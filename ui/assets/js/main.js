var socket = io.connect('http://localhost:16006');

socket.on('overallStats', function (lines) {
  var panel = document.querySelectorAll('#statsGoHere')[0];
  panel.innerHTML = '';
  lines.sort(function(a, b) {
    return b[3] - a[3];
  });
  lines.forEach(function(line) {
    var newEntry = document.createElement('tr');
    newEntry.addEventListener('click', function() { requestDetailsFor(line[4]); });
    newEntry.innerHTML = '<td>'+line.map(function(str) {
      return str.replace(/ /g, '&nbsp;&nbsp;');
    }).join('</td><td>') + '</td>';
    panel.appendChild(newEntry);
  });
});

socket.on('runningOutput', function (lines) {
  var panel = document.querySelectorAll('#outputGoHere')[0];
  for (var i=0; i<lines.length; i++) {
    var newEntry = document.createElement('tr');
    newEntry.innerHTML = '<td>'+lines[i].map(function(str) {
      return str.replace(/ /g, '&nbsp;&nbsp;');
    }).join('</td><td>') + '</td>';
    panel.appendChild(newEntry);
  }
});

socket.on('detailResponse', function(details) {
  var panel = document.querySelectorAll('#overallStats')[0];
  panel.innerHTML = '';
  details.calledFrom.forEach(function(path) {
    var newPath = document.createElement('div');
    newPath.innerHTML = path;
    panel.appendChild(newPath);
  });

  var code = document.createElement('pre');
  code.innerHTML = details.code;
  panel.appendChild(code);

  // details.code.split('\n').forEach(function(line) {
  //   newLine.innerHTML += line+"\n";
  //   panel.appendChild(newLine);
  // });
});

function requestDetailsFor(modulePath) {
  socket.emit('detailRequest', modulePath);
}

function startTracer() {
  socket.emit('startTracer');
}

function stopTracer() {
  socket.emit('stopTracer');
}
