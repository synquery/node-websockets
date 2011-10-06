/***/
var util = require('util'), events = require('events'), crypto = require('crypto');
var fs = require('fs'), URL = require('url'), path = require('path');

var STATE = {
  CONNECTING: 0,
  OPEN: 1,
  CLOSING: 2,
  CLOSED: 3
};

module.exports = exports = WebSocket;

var EVTS = ['close', '_closing', 'connect', 'error', 'message'], length = EVTS.length;

function WebSocket(req, socket, upgradeHead, opts) {
  var self = this;
  events.EventEmitter.call(self);
  
  self._req = req;

  self.readyState = STATE.CONNECTING;

  self.on('error', function(err) {
    self.close(err && err.message);
    if('function' === typeof self.onerror)
      self.onerror(err);
  });

  self.on('close', function() {
    self.readyState = STATE.CLOSED;
    if('function' === typeof self.onclose)
      self.onclose();
  });

  self.on('open', function() {
    self.readyState = STATE.OPEN;
    if('function' === typeof self.onopen)
      self.onopen();
  });

  self.on('message', function() {
    if('function' === typeof self.onmessage)
      self.onmessage();
  });

  self.on('_closing', function(reason) {
    self.readyState = STATE.CLOSING;
    process.nextTick(function() {
      close.call(self, reason);
    });
  });

  self.on('connect', function() {
    self.emit('open');
  });

  process.nextTick(function() {
    handShake.call(self, req, socket, upgradeHead, opts);
  });
}
util.inherits(WebSocket, events.EventEmitter);

function handShake(req, socket, upgradeHead, opts) {
  var self = this;

  var Protocol = require('./' + _getProtocol.apply(null, arguments));
  var protocol = self.protocol = new Protocol(req, socket, upgradeHead, opts);

  var i = length, evts = EVTS;
  for(; i--;)
    _bubbling(evts[i], protocol, self);

  self.on('connect', function(socket) {
    self.secure = !!socket.encrypted;
    var _socket = socket['socket'] || socket;
    _socket.setTimeout(0);
    _socket.setNoDelay(true);
    _socket.setKeepAlive(true, 0);
  });
  
  protocol.handShake(req, socket, upgradeHead, opts);

};

function close(reason) {
  var self = this, protocol = self.protocol;
  self.send = function() {
  };
  protocol.close(reason);
}

WebSocket.prototype.send = function(message) {
  this.protocol.write(message);
};

WebSocket.prototype.close = function(reason) {
  this.emit('_closing');
};

WebSocket.prototype.addEventListener = WebSocket.prototype.addListener;

function _bubbling(evt, from, to) {
  from.on(evt, function() {
    var args = Array.prototype.slice.call(arguments);
    args.unshift(evt);
    to.emit.apply(to, args);
  });
}

// TODO
function _getProtocol(arg0) {
  // for client
  if('string' === typeof arg0)
    return 'draft-10';

  var version = arg0['headers']['sec-websocket-version'];

  if('8' === version)
    return 'draft-10';

  // default: draft10
  return 'draft-10';
}
