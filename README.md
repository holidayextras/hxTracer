## Introduction
---

I wrote this javascript tracer to gain a better insight into how a project worked. Hopefully it'll help others too. Keep reading for an explanation on how it works.

## How do I use it?
---

Simply require this module somewhere:
```
var hxTracer = require('hxTracer');
```
Or, include it on a webpage.

The tracer starts off disabled, when you get near a code path you want to trace:
```
hxTracer.start();
```
then when finished:
```
hxTracer.stop();
```
eg:
```
hxTracer.start();
cache.storeObject('test', { key: 'foobar' }, function(err) {
	hxTracer.stop();
});
```
Or, the tracer can be toggled on/off by sending the process a PIPE signal:
```
/repos/redis-benchmark:ps aux | grep node
username    14116 15.5  0.1 662156 21992 pts/0    Sl+  22:27   0:00 node test.js
/repos/redis-benchmark:kill -PIPE 14116
```

When your project runs into the tracer it will spit tracing info out to `stderr` like this:
```
TRACER OVERHEAD 0.13ms per timing
...
TRACER FNI 4398.08ms 6440456  /repos/redis-benchmark/Cache.js.prototype.findObject
TRACER FNI 4398.14ms 6440456    /repos/redis-benchmark/Cache.js.prototype.generateCacheKey
TRACER FNR 4398.19ms 6440456    /repos/redis-benchmark/Cache.js.prototype.generateCacheKey
TRACER FNI 4398.25ms 6440456    /repos/redis-benchmark/Cache.js.prototype.get
TRACER FNR 4398.29ms 6440456    /repos/redis-benchmark/Cache.js.prototype.get
TRACER FNR 4398.33ms 6440456  /repos/redis-benchmark/Cache.js.prototype.findObject
...
TRACER EV LAG 59ms
...
TRACER FNI 4403.47ms 6440456  /repos/redis-benchmark/Cache.js.prototype._processGetQueue
TRACER FNI 4404.02ms 6440456    /repos/redis-benchmark/Cache.js.prototype.mget
TRACER FNI 4404.12ms 6440456      /repos/redis-benchmark/RedisClient.js.prototype.mget
TRACER FNI 4404.28ms 6440456        /repos/redis-benchmark/RedisClient.js.prototype._isClientConnected
TRACER FNR 4404.35ms 6440456        /repos/redis-benchmark/RedisClient.js.prototype._isClientConnected
TRACER FNR 4404.60ms 6440456      /repos/redis-benchmark/RedisClient.js.prototype.mget
TRACER FNR 4404.64ms 6440456    /repos/redis-benchmark/Cache.js.prototype.mget
TRACER FNR 4404.70ms 6440456  /repos/redis-benchmark/Cache.js.prototype._processGetQueue
...
[Test finished in 203ms]
TRACER CBR 4775.91ms 6440456  /repos/redis-benchmark/node_modules/async/lib/async.js.parallel
TRACER CBR 4776.05ms 6442576    /repos/redis-benchmark/node_modules/async/lib/async.js.map
TRACER CBR 4776.16ms 6444720      /repos/redis-benchmark/node_modules/async/lib/async.js.each
TRACER CBR 4776.26ms 6446872        /repos/redis-benchmark/Cache.js.prototype.findObject
TRACER CBR 4776.36ms 6449016          /repos/redis-benchmark/Cache.js.prototype.get
TRACER EV LAG 71ms
TRACER TOTAL OVERHEAD 7.27ms
TRACER TOTAL 202.02ms 202.33ms 202.02ms 1 /repos/redis-benchmark/node_modules/async/lib/async.js.parallel
TRACER TOTAL 200.73ms 201.29ms 200.73ms 1 /repos/redis-benchmark/node_modules/async/lib/async.js.map
TRACER TOTAL 199.87ms 200.74ms 199.87ms 1 /repos/redis-benchmark/node_modules/async/lib/async.js.each
TRACER TOTAL 31.30ms 106.57ms 183.26ms 100 /repos/redis-benchmark/Cache.js.prototype.findObject
TRACER TOTAL 30.69ms 106.31ms 182.95ms 100 /repos/redis-benchmark/Cache.js.prototype.get
TRACER TOTAL 3.53ms 3.68ms 3.53ms 1 /repos/redis-benchmark/Cache.js.prototype.mget
TRACER TOTAL 3.20ms 3.51ms 3.20ms 1 /repos/redis-benchmark/RedisClient.js.prototype.mget
TRACER TOTAL 2.56ms 2.56ms 2.56ms 1 /repos/redis-benchmark/Cache.js.prototype._processGetQueue
TRACER TOTAL 0.04ms 0.37ms 27.89ms 100 /repos/redis-benchmark/Cache.js.prototype.generateCacheKey
TRACER TOTAL 0.20ms 0.20ms 0.20ms 1 /repos/redis-benchmark/RedisClient.js.prototype._isClientConnected
```

Where:
`FNI` is `Function Invoked`, `FNR` is `Function Returned`, `CBI` is `Callback Invoked`, `CBR` is `Callback Returned`.
The columns provided by `TRACER TOTAL` are: `min duration`, `average duration`, `max duration`, `call count`, `file`.

If you want the tracer to stop at extra places, you can:
```
hxTracer.log('Cache Callback');
```


## Tracing a Node.js project
---

### Setting the Scene

Here's some code I'd like to trace, annotated with a few points which are, or might be, interesting.
```
var async = require('async');
var library = require('lib/library');

// Point A
async.map(listOfCodes, function(code, callback) {
  // Point B
  library.findObjectsByCode(code, function(err, results) {
    // Point C
    if (err) return callback(null, [ ]);
    return callback(null, results); // Point D
  });
  return; // Point E
}, function(err, results) {
  // Point F
  results = results || [ ];
  console.log(Array.prototype.concat.apply([ ], results);
  return; // Point G
});
return; // Point H
```
When tracing this, I would like to know what code paths are being followed, the order in which they are being executed, how long it is taking to get between the various code points annotated above, and how much time in total is being spent in various functions.

### Examining the 'module' module.
This is a trimmed down version of the structure of a `module` object:
```
> console.log(module);
{ exports: { ... },
  parent: { ..reference to the module that referenced this module.. },
  children: [ { ..reference to modules required by this one.. } ] }
```
The exports property contains a reference to the cached `module.exports` for the given module.

Apart from the starting module, whose `parent` will be `undefined`, the `parent` and `children` properties form circular references:
```
> [ some module ].parent.children.indexOf([ some module ]) >= 0
true
> console.log(JSON.stringify(module, null, 2))
TypeError: Converting circular structure to JSON
```
This is both awesome and terrible at the same time - it means that any included module in a given project can obtain the references to every loaded module in the entire project. It also means that any module can alter the exports or behaviour of any other module in the project:
```
var async = require('async);
module.parent.children[0].exports.foo = 'bar';
console.log(async.foo);
```
So how can we abuse this power to trace an entire project?

### Scoping out a project
First we need to start by locating the core module that spawned the whole project. From anywhere, grab the 'global' (well, within scope of each file) `module` object and traverse to the top of the tree:
```
var parentModule = module;
while (parentModule.parent) parentModule = parentModule.parent;
```
Then we've just got to work our way back down the tree obtaining references to every modules exports. In this example, every module's exports get run through a `bootstrap` function:
```
function processModules(item) {
  if (item.exports && !item._traced) {
    bootstrap(item, 'exports', item.filename);
    item._traced = true;
  }
  if (item.children) {
    item.children.map(processModules);
  }
}
processModules(parentModule);
```
As it stands, this will bootstrap every function in every module - tracing our 3rd party modules at a high level can be great, digging deeper into them is just going to create a lot of noise and make it harder to focus on our own code. We can limit the coverage to something a bit more sensible:
```
if ( ((path.indexOf('node_modules') !== -1) && (path.split('node_modules')[1].split('/').length > 3)) ||
     (path.split('.').length > 5) ) return;
```

### Infecting enough code for a basic trace
So first up is attacking the exported objects - the most common exports patterns that I'm interested in are these two:
```
function SomeClass();
module.exports = SomeClass;
SomeClass.prototype.foo = function() { .... };
```
and
```
module.exports = {
  foo = function() { .... }
};
```
So we've simply going to traverse every modules exports - if the value is a `Function` then we're going to go after both it, it's prototype and any static properties attached to it. We're then going to iterate over every property on the value, looking for other `Function` references or objects and repeat the process:
```
function bootstrap(item, path) {
  var original = item[prop];
  if (item[prop] instanceof Function) {
    // Infect the actual function
    infect(item, prop, path);
    // Infect the functions prototype
    if (item[prop].prototype) {
      bootstrap(item[prop], 'prototype', path+'.prototype');
    }
    // Clone the static properties on the original function
    for (var i in original) {
      item[prop][i] = original[i];
    }
  }
  if (item[prop] instanceof Object) {
    // Bootstrap any other properties
    for (var i in item[prop]) {
      bootstrap(item[prop], i, path+'.'+i);
    }
  }
  return item;
}
```
Now we want to alter every one of these functions so that we can work out what order events are occuring, and how long it is taking to get between different code points. All we've got to do is record the original function reference then replace it with one of our own which does some tracing and calls on to the original. This is the basic format I've gone with:
```
function infect(item, i, path) {
  var original = item[i];
  item[i] = function() {
    return (function() {
      // ... trace stuff
      // ... invoke the original function, passing the correct scope
      // ... trace some more
      // ... return the result
    }).apply(this, Array.prototype.slice.call(arguments));
  };

  // Make sure we don't lose any prototypes!
  item[i].prototype = original.prototype;
}
```
This is cool, we're now tracing a bunch of functions across our project, but it's not covering some of the more interesting parts like anonymous functions or functions that are passed around to other modules.

### Tracing the anonymous functions
The trick here is not to think too hard about how to get these in scope. Most of the anonymous functions we're going to be interested in are passed into the functions we've already traced, so tweaking them is remarkably simple. This example is an extension of the previous one:
```
function infect(item, i, path) {
  var original = item[i];
  item[i] = function() {
    return (function() {
      var functionArgs = Array.prototype.slice.call(arguments);
      functionArgs = functionArgs.map(function(arg) {
        if (!(arg instanceof Function)) return arg;
        return function() {
          // ... trace stuff
          // ... invoke the original function, passing the correct scope
          // ... trace some more
          // ... return the result
        };
      });

      // ... trace stuff
      // ... invoke the original function, passing the correct scope
      // ... trace some more
      // ... return the result
    }).apply(this, Array.prototype.slice.call(arguments));
  };

  // Make sure we don't lose any prototypes!
  item[i].prototype = original.prototype;
}
```
The idea is simple - whenever a traced function is invoked, if it's passed a function then we change it for a new one which does our tracing and continues on to where it was meant to go. Wonderful.

### Allowing Dependency Injection
Some modules like to stringify functions to see how many parameters have been named, then altering how those functions are invoked accordingly. If we want this to continue working with our tracer we need to go a bit further and tweak our new functions parameters to match those of the original:
```
var dependencies = original.toString().match(/^function .*?\((.*?)\)/);
if (dependencies) {
  var newFunc = item[i].toString();
  newFunc = '(function() { return '+newFunc.replace('function ()', 'function ('+dependencies[1]+')')+ '; })()';
  item[i] = eval(newFunc);
}
```
This part is less than pleasant, but it gets the job done.

### Measuring Time
We are going to need sub-millisecond accuracy when measuring how long it takes to get from A to B. Node provides this:
```
> process.hrtime();
[ 99343, 41943674 ]
```
Those two numbers are `seconds` then `nanoseconds` and are described in the documentation as `It is relative to an arbitrary time in the past. It is not related to the time of day and therefore not subject to clock drift. The primary use is for measuring performance between intervals.`. We're going to combine these numbers, move the decimal place to milliseconds, round off the nanoseconds and reduce the number down to something easier to read: `1234.56ms`
```
function meaningfulTime() {
  var parts = process.hrtime();
  return (((parts[0]*1000)+(parts[1]/1000000))%10000).toFixed(2) + 'ms';
}
```
