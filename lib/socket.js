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

var Events = ['close', '_closing', 'connect', 'error', 'message'];
var EvtLen = Events.length;

function WebSocket() {
  // req, socket, upgradeHead, opts
  var self = this;
  events.EventEmitter.call(self);

  self.readyState = State.CONNECTING;

  self.on('error', function(err) {
    // console.log('WebSocket.error', err);
    self.close(err && err.message);
    if('function' === typeof self.onerror)
      self.onerror(err);
  });

  self.on('close', function(reason) {
    // console.log('WebSocket.close', reason);
    self.readyState = State.CLOSED;
    if('function' === typeof self.onclose)
      self.onclose(reason);
  });

  self.on('open', function(evt) {
    // console.log('WebSocket.open.');
    self.readyState = State.OPEN;
    if('function' === typeof self.onopen)
      self.onopen(evt);
  });

  self.on('message', function(evt) {
    // console.log('WebSocket.message.');
    if('function' === typeof self.onmessage)
      self.onmessage(evt);
  });

  self.on('_closing', function(reason) {
    // console.log('WebSocket._closing', reason);
    self.readyState = State.CLOSING;
    process.nextTick(function() {
      close.call(self, reason);
    });
  });

  self.on('connect', function(evt) {
    // console.log('WebSocket.connect, then emit open.');
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

  var ptc = _getProtocol.apply(null, arguments), Protocol = require('./' + ptc);
  var protocol = self.protocol = new Protocol(req, socket, upgradeHead, opts);

  //  var socketClose = socket.end;
  //  socket.end = function() {
  //    console.log('socket.end() is called by someone.');
  //    var i = 0, fn = socket.end;
  //    while(fn.caller) {
  //      console.log(++i + ':', fn.caller);
  //      fn = fn.caller;
  //    }
  //    socketClose.apply(socket, arguments);
  //  };

  var i = EvtLen;
  for(; i--;)
    _bubbling(Events[i], protocol, self);

  self.on('connect', function(socket) {

    // console.log(ptc + '.connect');
    self.secure = !!socket.encrypted;

    // TODO no such socket.socket case?
    var _socket = socket['socket'] || socket;

    _socket.setTimeout(0);
    _socket.setNoDelay(!0);
    _socket.setKeepAlive(!0, 0);

  });
  protocol.handShake.apply(protocol, arguments);

};

function close(reason) {
  var self = this, protocol = self.protocol;
  self.send = function() {
  };
  // console.log('[socket.js] Socket.close:', reason);
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
    // console.log('BUBBLING!', evt);
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
