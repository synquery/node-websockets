/***/
var util = require('util'), events = require('events'), crypto = require('crypto');
var fs = require('fs'), URL = require('url'), path = require('path');

var State = {
  CONNECTING: 0,
  OPEN: 1,
  CLOSING: 2,
  CLOSED: 3
};

module.exports = exports = WebSocket;
for( var i in State)
  WebSocket[i] = State[i];

var EVTS = ['close', '_closing', 'connect', 'error', 'message'], length = EVTS.length;

function WebSocket() {
  //req, socket, upgradeHead, opts
  var self = this;
  events.EventEmitter.call(self);

  self.readyState = State.CONNECTING;

  self.on('error', function(err) {
    self.close(err && err.message);
    if('function' === typeof self.onerror)
      self.onerror(err);
  });

  self.on('close', function(reason) {
    self.readyState = State.CLOSED;
    if('function' === typeof self.onclose)
      self.onclose(reason);
  });

  self.on('open', function(evt) {
    self.readyState = State.OPEN;
    if('function' === typeof self.onopen)
      self.onopen(evt);
  });

  self.on('message', function(evt) {
    if('function' === typeof self.onmessage)
      self.onmessage(evt);
  });

  self.on('_closing', function(reason) {
    self.readyState = State.CLOSING;
    process.nextTick(function() {
      close.call(self, reason);
    });
  });

  self.on('connect', function(evt) {
    self.emit('open', evt);
  });

  var args = arguments;
  process.nextTick(function() {
    handShake.apply(self, args);
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
  protocol.handShake.apply(protocol, arguments);

};

function close(reason) {
  var self = this, protocol = self.protocol;
  self.send = function() {
  };
  protocol.close(reason);
}

WebSocket.prototype.send = function(message, options) {
  this.protocol.write(message, options);
};

WebSocket.prototype.broadcast = function(message, options) {
  this.emit('broadcast', message, options);
};

WebSocket.prototype.close = function(reason) {
  this.emit('_closing');
};

WebSocket.prototype.addEventListener = WebSocket.prototype.addListener;

function _bubbling(evt, from, to) {
  from.on(evt, function() {
    switch(arguments.length) {
    case 0:
      to.emit(evt);
      return;

    case 1:
      to.emit(evt, arguments[0]);
      return;

    case 2:
      to.emit(evt, arguments[0], arguments[1]);
      return;

    default:
      var args = Array.prototype.slice.call(arguments);
      args.unshift(evt), to.emit.apply(to, args);
      return;
    }
  });
}

// TODO
function _getProtocol(arg0) {
  // for client
  if('string' === typeof arg0)
    return 'rfc6455';

  var header = arg0['headers'];
  var version = header['sec-websocket-version'];

  if('8' === version)
    return 'draft-10';

  if(header['sec-websocket-key1'] && header['sec-websocket-key2'])
    return 'draft-00';
  // default: rfc6455
  return 'rfc6455';
}
