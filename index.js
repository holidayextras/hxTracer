/*******************************************************************
Copyright 2013 Oliver Rumbelow oliver.rumbelow@holidayextras.com

This file is part of hxTracer

hxTracer is free software: you can redistribute it and/or modify
it under the terms of the GNU General Public License as published by
the Free Software Foundation, either version 3 of the License, or
(at your option) any later version.

hxTracer is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
GNU General Public License for more details.

You should have received a copy of the GNU General Public License
along with hxTracer.  If not, see <http://www.gnu.org/licenses/>.
*******************************************************************/
( function() {

var space = "                                                                                                                  ";
var currentIndentation = 0;
var timeline = [ ];
function addToTimeline() {
  var args = Array.prototype.slice.call(arguments).map(function(str) {
    return ''+str;
  });
  timeline.push(args);
}
var stats = { };
var active = false;

// Establish the core module for the project
var moduleRef = (typeof module != 'undefined') ? module : null;
var global = global || { };
var parentModule = moduleRef || { };
var processRef = (typeof process != 'undefined') ? process : { memoryUsage: function() { return { heapUsed: '' } } };
while (parentModule.parent) parentModule = parentModule.parent;

// tooBusy attempts to measure event loop lag
var tooBusy;
function startTooBusy() {
  var lastInterval = [ new Date() ];
  var tooBusy = setInterval(function() {
    lastInterval.push(new Date());
    addToTimeline("EV LAG", ((lastInterval[1] - lastInterval[0])-5)+'ms');
    lastInterval.shift();
  }, 5);
}
function stopTooBusy() {
  tooBusy = null;
}

// If GC is exposed, wrap it and trace it
if (global.gc) {
  var gc = global.gc;
  global.gc = function() {
    var startTime = meaningfulTime();
    gc();
    addToTimeline('GARBAGE', (parseFloat(meaningfulTime()) - parseFloat(startTime)).toFixed(2)+'ms');
  };
}

// Grab a timestamp and add it to the tracers output
function timeAndLog(text) {
  if (active) {
    var spaces = space.substring(0, currentIndentation);
    addToTimeline('TXT', meaningfulTime(), spaces, text);
  }
}

// This iterates over every module in the project and attempts
// to bootstrap each one in turn
function processModules(item) {
  if (item.exports && !item._traced) {
    bootstrap(item, 'exports', item.filename);
    item._traced = true;
  }
  if (item.children) {
    item.children.map(processModules);
  }
}

var allFuncs = [ ];
// Bootstrap recursively iterates through an item, infecting every Function
function bootstrap(item, prop, path) {
  if ( (path.split('node_modules').length > 2) || (path.slice(-4) == 'emit') || (item == require('util') && (prop=='format')) ) return;
  if (!item.hasOwnProperty(prop) || Object.getOwnPropertyDescriptor(item, prop).get) return;
  var original = item[prop];
  if (allFuncs.indexOf(original) !== -1) return;
  allFuncs.push(original);
  if (item[prop] instanceof Function) {
    infect(item, prop, path);
    if (item[prop].prototype) {
      bootstrap(item[prop], 'prototype', path+'.prototype');
    }
    for (var i in original) {
      if (!original.hasOwnProperty(i) || Object.getOwnPropertyDescriptor(original, i).get) return;
      item[prop][i] = original[i];
    }
  }
  if (item[prop] instanceof Object) {
    for (var i in item[prop]) {
      bootstrap(item[prop], i, path+'.'+i);
    }
  }
  return item;
}

// Infect replaces a function with a new one which does tracing and dissolves to give the
// outward appearance that it was never there
function infect(item, i, modulePath) {
  var original = item[i];
  if (original.__infected) return;
  item[i] = function() {
    return (function() {
      var functionArgs = Array.prototype.slice.call(arguments);
      // If we're not tracing, don't do anything.
      if (!active) return original.apply(this, functionArgs);

      // Start gathering stats for when the tracing is stopped
      stats[modulePath] = stats[modulePath] || { totalTime: 0, count: 0, min: 99999, max: 0, calcs: 1 };
      stats[modulePath].count++;

      // These are the timings we're interested in
      var functionInvokedAt = meaningfulTime();
      var functionReturnedAt = null;
      var callbackInvokedAt = null;
      var callbackReturnedAt = null;
      var isAsync = false;
      var indentationWhenInvoked = currentIndentation;
      var spaces = space.substring(0, currentIndentation);

      // If the tracer function was invoked with any other functions, infect those too
      // (this captures a lot of anonymous, otherwise hidden, functions)
      functionArgs = functionArgs.map(function(arg) {
        if (!(arg instanceof Function)) return arg;
        var index = '['+functionArgs.indexOf(arg)+']';
        // This covers functions passed in which are NOT the last argument
        if (functionArgs.indexOf(arg) != (functionArgs.length-1)) return function() {
          currentIndentation = indentationWhenInvoked;
          addToTimeline('CBI', meaningfulTime(), processRef.memoryUsage().heapUsed, spaces + modulePath+index);
          var out = arg.apply(this, Array.prototype.slice.call(arguments));
          if (!active) return;
          addToTimeline('CBR', meaningfulTime(), processRef.memoryUsage().heapUsed, spaces + modulePath+index);
          stats[modulePath].calcs += 2;
          return out;
        };
        // If it gets here, we're dealing with the final argument and it's a function (read: the callback)
        isAsync = true;
        return function() {
          currentIndentation = indentationWhenInvoked;

          callbackInvokedAt = meaningfulTime();
          addToTimeline('CBI', callbackInvokedAt, processRef.memoryUsage().heapUsed, spaces + modulePath+index);

          var out = arg.apply(this, Array.prototype.slice.call(arguments));
          if (!active) return;

          callbackReturnedAt = meaningfulTime();
          addToTimeline('CBR', callbackReturnedAt, processRef.memoryUsage().heapUsed, spaces + modulePath+index);

          var callbackDuration = timeDiff(callbackReturnedAt, callbackInvokedAt);
          if (functionReturnedAt) {
            stats[modulePath].totalTime += timeDiff(callbackInvokedAt, functionReturnedAt);
            stats[modulePath].totalTime += callbackDuration;
          }
          stats[modulePath].calcs += 2;
          stats[modulePath].average = stats[modulePath].totalTime / stats[modulePath].count;

          var totalDuration = timeDiff(callbackReturnedAt, functionInvokedAt);
          if (totalDuration > stats[modulePath].max) stats[modulePath].max = totalDuration;
          if (totalDuration < stats[modulePath].min) stats[modulePath].min = totalDuration;

          return out;
        };
      });

      addToTimeline('FNI', functionInvokedAt, processRef.memoryUsage().heapUsed, spaces + modulePath);

      currentIndentation += 2;
      var out = original.apply(this, functionArgs);
      if (!active) return;
      currentIndentation -= 2;

      functionReturnedAt = meaningfulTime();
      addToTimeline('FNR', functionReturnedAt, processRef.memoryUsage().heapUsed, spaces + modulePath);

      // Guess how long it took
      var functionDuration = timeDiff(functionReturnedAt, functionInvokedAt);
      stats[modulePath].totalTime += functionDuration;
      stats[modulePath].calcs++;
      if (functionDuration > stats[modulePath].max) stats[modulePath].max = functionDuration;
      if (!isAsync) {
        if (functionDuration < stats[modulePath].min) stats[modulePath].min = functionDuration;
      }
      stats[modulePath].average = stats[modulePath].totalTime / stats[modulePath].count;

      // Our new function still returns the value of the original
      return out;
    }).apply(this, Array.prototype.slice.call(arguments));
  };

  // This bit examines the params required by the original function and copies them into our new function.
  // It's used to allow dependency injection or Function.toString() to work
  try {
    var dependencies = original.toString().match(/^function .*?\((.*?)\)/);
    if (dependencies) {
      var newFunc = item[i].toString();
      newFunc = '(function() { return '+newFunc.replace('function ()', 'function ('+dependencies[1]+')')+ '; })()';
      item[i] = eval(newFunc);
    }
  } catch(e) { }

  // Make sure we don't lose any prototypes!
  item[i].prototype = original.prototype;

  // Tag the new function so we don't trace it twice
  item[i].__infected = true;

  allFuncs.push(item[i]);
}

// The timestamps we get are artificilly limited to 10 seconds.
// They might wrap around, so take that in to account
function timeDiff(newest, oldest) {
  var diff = (parseFloat(newest) - parseFloat(oldest));
  if (diff < 0) {
    diff = ((10000 + parseFloat(newest)) - parseFloat(oldest));
  }
  return diff;
}

// Get a sub-millisecond timing thats actually readable
function meaningfulTime() {
  if (moduleRef) {
    var parts = processRef.hrtime();
    return (((parts[0]*1000)+(parts[1]/1000000))%10000).toFixed(2) + 'ms';
  } else {
    return performance.now().toFixed(2)+'ms';
  }
}

// Process our logs after tracing to work out how much time is spent where
function processLogs() {
  var output = [ ];

  for (var path in stats) {
    output.push( [ stats[path].min.toFixed(2)+'ms',
                   stats[path].average.toFixed(2)+'ms',
                   stats[path].max.toFixed(2)+'ms',
                   ''+stats[path].count,
                   path ] );
  }

  return output;
}

// Start the tracer :)
function startTracer() {
  if (!moduleRef) {
    for (var i in window) {
      if ([ 'top', 'document', 'window', 'worker', 'parent', 'frames', 'self', 'performance', 'navigator' ].indexOf(i) === -1) {
        processModules({ exports: window[i], filename: i })
      }
    }
  } else {
    processModules(parentModule);
  }
  active = true;
}

// Stop the tracer :(
function stopTracer() {
  active = false;
  processLogs();
}

// Start up a server
var express = require('express');
var app = express();
    app.use(express.static(__dirname+'/ui'));
var server = require('http').createServer(app);
    server.listen(16006);
var io = require('socket.io').listen(server, { log: false });
io.set('transports', [
  'websocket',
  'htmlfile',
  'xhr-polling',
  'jsonp-polling'
]);
io.enable('browser client minification');
io.enable('browser client etag');
io.enable('browser client gzip');
console.error('hxTracer is alive on port 16006');

io.sockets.on('connection', function (socket) {

  socket.on('startTracer', function () {
    startTracer();
  });

  socket.on('stopTracer', function () {
    stopTracer();
  });

  var dataInterval = setInterval(function() {
    var dataToSend = timeline;
    timeline = [ ];
    socket.emit('runningOutput', dataToSend);
    socket.emit('overallStats', processLogs());
  }, 500);
  socket.on('disconnect', function () {
    clearInterval(dataInterval);
  });

});

})();