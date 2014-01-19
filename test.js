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
var tracer = require('./index.js');
var assert = require('assert');
var util = require('util');

var debug = false;

function Parent(m, n, o) {
  if (debug) console.log("-- Superclass Instantiated", m, n, o);
  this.otherProp = 'Parent'+m+''+n+''+o;
}
var parentGetterVar = 0;
Parent.prototype = {
  get parentGetter() {
    if (debug) console.log("-- Parent prototype getter invoked");
    return this.otherProp.trim() + (parentGetterVar++);
  }
};

function Constructor(j, k, l) {
  // To make the Super() call work, it needs to be referenced by it's
  // exported reference. requiring it from another file will suffice
  module.exports.cons.super_.call(this, j, k, l);
  if (debug) console.log("-- Base Class Instantiated", j, k, l);
  this.prop = 'Const'+j+''+k+''+l;
};
util.inherits(Constructor, Parent);

Constructor.staticProperty = 'foo';

Constructor.staticFunction = function(a, b, c) {
  if (debug) console.log("-- Static function invoked", a, b, c);
  return "Static"+a+b+c;
};

Constructor.prototype.protoProperty = 'bar';

Constructor.prototype.protoFunction = function(d, e, f) {
  if (debug) console.log("-- Prototype function invoked", d, e, f);
  return "Proto"+d+e+f;
};

var getterHiddenVar = 0;
Object.defineProperty(Constructor.prototype, 'protoGetterProperty', {
  get: function() {
    if (debug) console.log("-- Prototype getter invoked");
    return getterHiddenVar++;
  },
  enumerable: true
});

function test(g, h, i) {
  if (debug) console.log("-- Test function invoked", g, h, i);
  return "Test"+g+h+i;
};

module.exports = {
  cons: Constructor,
  test: test
};

var thisModule = module.exports;

setInterval(function() {
  // Static function should still exist and work
  assert.equal(thisModule.cons.staticFunction(1, 2, 3), 'Static123');
  // Static function should look the same as the original
  assert.equal(thisModule.cons.staticFunction.toString().match(/function .*?\((.*?)\)/)[1], 'a, b, c');
  // Constructor should still exist and work
  var test = new thisModule.cons(1, 2, 3);
  // Constructor should still look the same as the original
  assert.equal(thisModule.cons.toString().match(/function .*?\((.*?)\)/)[1], 'j, k, l');
  // Constructor should have correct scope
  assert.equal(test.prop, 'Const123');
  assert.equal(test.otherProp, 'Parent123');
  // Constructor should construct objects of the correct type
  assert.ok(test instanceof Constructor);
  assert.ok(test instanceof Parent);
  // Instances Prototype function should still exist and work
  assert.equal(test.protoFunction(1, 2, 3), 'Proto123');
  // Instances Prototype function should still look the same as the original
  assert.equal(test.protoFunction.toString().match(/function .*?\((.*?)\)/)[1], 'd, e, f');
  // Instances Prototype getter should still be a getter
  getterHiddenVar = 6;
  assert.equal(test.protoGetterProperty, 6);
  assert.equal(test.protoGetterProperty, 7);
  parentGetterVar = 6;
  assert.equal(test.parentGetter, 'Parent1236');
  assert.equal(test.parentGetter, 'Parent1237');
  // Static property on Constructor should still exist and have same value
  assert.equal(thisModule.cons.staticProperty, 'foo');
  // Static property on Prototype should still exist and have same value
  assert.equal(test.protoProperty, 'bar');
  // Exported function should still exist and work
  assert.equal(thisModule.test(1, 2, 3), 'Test123');
  // Exported function should still exist and look the same as the original
  assert.equal(thisModule.test.toString().match(/function .*?\((.*?)\)/)[1], 'g, h, i');
}, 5000);
