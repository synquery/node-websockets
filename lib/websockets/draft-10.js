/***/
var util = require('util'), events = require('events'), crypto = require('crypto');
var URL = require('url'), http = require('http'), https = require('https');

var GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';
var HANDSHAKE_RESPONSE = 'HTTP/1.1 101 Switching Protocols\r\nSec-WebSocket-Protocol: *\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ';
var ERR_400 = 'HTTP/1.1 400 Forbidden\r\n\r\n400 Bad Request';
var ERR_403 = 'HTTP/1.1 403 Forbidden\r\n\r\n403 Forbidden';
var ERR_426 = 'HTTP/1.1 426 Forbidden\r\n\r\n426 Upgrade Required';

module.exports = exports = Draft10;

function Draft10(arg0) {
  var self = this;
  events.EventEmitter.call(self);

  var isClient = 'string' === typeof arg0;

  var Core = isClient ? Client: Server;
  self.core = new Core(self);
  
  self._options = (isClient ? arguments[1]: arguments[3]) || {};

  self.on('_data', function(data, fin, opcode) {
    if(0 !== opcode)
      self.opcode = opcode, self.buffer = [];
    Array.prototype.push.apply(self.buffer, data);
    self.emit('data', new Buffer(data), fin, self.opcode);
    fin && self.emit('message', new Buffer(self.buffer));
  });
}
util.inherits(Draft10, events.EventEmitter);

function _option(key) {
  return this._options[key];
}

function Server(parent) {
  this.parent = parent;
}
function Client(parent) {
  this.parent = parent;
}

// ---------------------------------------------------
// close
// ---------------------------------------------------
Server.prototype.close = function(reason) {
  close.call(this, reason, 0);
};
Client.prototype.close = function(reason) {
  close.call(this, reason, 1);
};
Draft10.prototype.close = function(reason) {
  this.core.close(reason);
};
function close(reason, maskbit) {
  var self = this, parent = self.parent;
  var message = ERR_CODE[reason] || (reason + '');
  _ctrl.call(self, OPCODE['close'], maskbit, message);

  parent.close = function() {
    var socket = parent.socket;
    socket.writable && socket.end();
    socket.destroy();
  };
}

// ---------------------------------------------------
// Control Frames
// ---------------------------------------------------
function _ctrl(opcode, maskbit, data) {
  var parent = this.parent, buf = new Buffer(data);
  if(125 < buf.length)
    buf = buf.slice(0, 124);

  var fin = 1;
  var ext = [0x00, 0x00, 0x00];

  parent.socket.write(frame(fin, ext, opcode, maskbit, buf));

}

// ---------------------------------------------------
// write
// ---------------------------------------------------
Server.prototype.write = function(massage) {
  write.call(this, massage, 0);
};
Client.prototype.write = function(massage) {
  write.call(this, massage, 1);
};
Draft10.prototype.write = function(massage) {
  this.core.write(massage);
};
function write(message, maskbit) {
  var socket = this.parent.socket;

  var buf = new Buffer(message), len = buf.length;

  var i, data = [], size = BUFFER_SIZE;
  for(i = 0; i < len; i += size)
    data.push(buf.slice(i, Math.min(buf.length, i + size)));

  var fin = 0;
  var ext = [0, 0, 0];
  var opcode = OPCODE[typeof message];
  var mask = maskbit;

  i = 0, len = data.length;

  for(; i < len - 1; i++, opcode = 0)
    socket.write(frame(fin, ext, opcode, mask, data[i]));

  fin = 1;
  socket.write(frame(fin, ext, opcode, mask, data[i]));

}

// ---------------------------------------------------
// pong
// ---------------------------------------------------
Draft10.prototype.pong = Draft10.prototype.write;

// ---------------------------------------------------
// parse
// ---------------------------------------------------
Server.prototype.parse = function(data) {
  parse.call(this, data, 1);
};
Client.prototype.parse = function(data) {
  parse.call(this, data, 0);
};
Draft10.prototype.parse = function(data) {
  this.core.parse(data);
};
function parse(data, maskbit) {
  var parent = this.parent, i, j, target = data;
  parent.message = [];

  var OP_FUNC = {
    _def: function(payload, fin, opcode) {
      parent.emit('_data', payload, fin, opcode);
    },
    0x00: function(payload, fin) {
      OP_FUNC['_def'](payload, fin, 0);
    },
    0x01: function string(payload, fin) {
      OP_FUNC['_def'](payload, fin, 1);
    },
    0x02: function binary(payload, fin) {
      OP_FUNC['_def'](payload, fin, 2);
    },
    0x08: function close() {
      parent.emit('_closing', 1000);
    },
    0x09: function ping(payload) {
      self.pong(payload);
    },
    0x0A: function pong(payload) {
      // TODO
    }
  };

  for(i = 0; 0 !== target.length; i = 0) {

    var byte = target[i++];
    var fin = byte >>> 7;
    var ope = (byte & 0x0F);

    byte = target[i++];
    var mask = byte >>> 7;
    if(maskbit !== mask)
      return parent.emit('error', 1002);
    var len = byte & 0x7F;

    if(127 === len)
      len = (target[i++] << 56) + (target[i++] << 48) + (target[i++] << 40) + (target[i++] << 32) + (target[i++] << 24) + (target[i++] << 16) + (target[i++] << 8) + target[i++];
    else if(126 === len)
      len = (target[i++] << 8) + target[i++];

    var maskkey = maskbit ? [target[i++], target[i++], target[i++], target[i++]]: null;
    var payload = [];

    for(j = 0; len--; j++)
      payload.push(maskkey ? target[i++] ^ maskkey[j % 4]: target[i++]);

    target = target.slice(i);

    if('function' !== typeof OP_FUNC[ope])
      return parent.emit('error', 1002);

    OP_FUNC[ope](payload, !!fin);
  }

}

// ---------------------------------------------------
// hand shake
// ---------------------------------------------------
Draft10.prototype.handShake = function() {
  var core = this.core;
  core.handShake.apply(core, arguments);
};
Server.prototype.handShake = function(req, socket, upgradeHead) {
  var parent = this.parent, head = req['headers'];
  parent.socket = socket;

  var i, keys = ['host', 'sec-websocket-key'];
  for(i = keys.length; i--;)
    if(!(keys[i] in head))
      return socket.write(ERR_400);
  if('websocket' !== head['upgrade'])
    return socket.write(ERR_400);
  if('8' !== head['sec-websocket-version'])
	return socket.write(ERR_426);
  if(true !== _isAllowed())
	return socket.write(ERR_403);
  
  // TODO
  head['sec-websocket-protocol'], head['cookie'];

  socket.on('close', function() {
    parent.emit('close');
  });

  socket.on('end', function() {
    parent.emit('close');
  });
  
  socket.on('data', function(data) {
    parent.parse(data);
  });

  var newkey = _hashAndEncode(head['sec-websocket-key']);
  socket.write(HANDSHAKE_RESPONSE);
  socket.write(newkey + '\r\n\r\n');
  parent.emit('connect', socket);

  function _isAllowed() {
	var validate = parent._options['validateOrigin'];
	return 'function' === typeof validate ? validate(head): true;
  }
};
Client.prototype.handShake = function(uri) {
  var parent = this.parent, url = URL.parse(uri);
  parent.URL = uri;

  var secure = parent.secure = 'wss:' === url['protocol'];

  var URI = url['protocol'];
  URI += '//';
  URI += url['host'];
  URI += url['pathname'] || '/';
  URI += (url['search'] || '').replace(/#/, '%23');

  var key = _createKey();

  var opts = {
    port: url['port'] || (secure ? 443: 80),
    host: url['hostname'],
    headers: {
      Connection: 'Upgrade',
      Upgrade: 'websocket',
      'Sec-Websocket-Key': key,
      'Sec-Websocket-Origin': 'node-websockets',
      'Sec-Websocket-Version': 8
    }
  };

  if(secure) {
	opts['key'] = parent._options['key'];
	opts['cert'] = parent._options['cert'];
	opts['ca'] = parent._options['ca'];
  }

  var prtcl = secure ? https: http, agent;
  if(prtcl.getAgent) {
    agent = prtcl.getAgent(opts['host'], opts['port']);
    opts['agent'] = agent;
  }
  var req = prtcl.request(opts);
  req.end();
  agent = agent || req;

  var newkey = _hashAndEncode(key);

  agent.on('upgrade', function(res, socket, upgradeHead) {

    socket.on('close', function(had_error) {
      parent.emit('close', had_error);
    });

    socket.on('data', function(data) {
      parent.parse(data);
    });

    // TODO
    var status = res['statusCode'];
    if(101 !== status)
      return parent.emit('_closing', status);

    var head = res['headers'];
    if('websocket' !== head['upgrade'] || 'Upgrade' !== head['connection'])
      return parent.emit('error', new Error('Invalid Response Header'));

    if(head['sec-websocket-accept'] !== newkey)
      return parent.emit('error', new Error('Invalid Server Response'));

    parent.socket = socket;

    parent.emit('connect', socket);
  });
  req.on('error', function(err) {
    parent.emit('error', err);
  });

  function _createKey() {
    var i, arr = [];
    for(i = 16; i--;)
      arr.push(~~(Math.random() * 256));
    return (new Buffer(arr)).toString('base64');
  }
};

var OPCODE = {
  string: 0x01,
  binary: 0x02,
  close: 0x08,
  ping: 0x09,
  pong: 0x0A
};
var ERR_CODE = {
  1000: 'Normal Closure',
  1001: 'Going Away',
  1002: 'Protocol error',
  1003: 'Unsupported Data',
  1004: 'Frame Too Large',
  1005: 'No Status Rcvd', // MUST NOT be set in Close control
  1006: 'Abnormal Closure', // MUST NOT be set in Close control
  1007: 'Invalid UTF-8'
};

var BUFFER_SIZE = 5;

function _hashAndEncode(key) {
  var newkey = (key + GUID).trim();
  var shasum = crypto.createHash('sha1');
  shasum.update(newkey);
  return shasum.digest('base64');
}

function frame(fin, ext, opcode, mask, payload) {
  var arr = [];
  var push = Array.prototype.push;
  push.apply(arr, _1st(fin, ext, opcode));
  push.apply(arr, _length(mask, payload));
  push.apply(arr, _payload(mask, payload));

  return new Buffer(arr);
}

function _1st(fin, ext, opcode) {
  return [(fin << 7) | (ext[0] << 6) | (ext[1] << 5) | (ext[2] << 4) | opcode];
}

function _length(mask, payload) {
  var length = payload.length, len = length, extlen = [];
  if(length <= 125)
    ;
  else if(length <= 0xFFFF) {
    len = 126;
    extlen.push(length & 0xFF00);
    extlen.push(length & 0x00FF);
  } else {
    len = 127;
    extlen.push(length & 0xFF00000000000000);
    extlen.push(length & 0x00FF000000000000);
    extlen.push(length & 0x0000FF0000000000);
    extlen.push(length & 0x000000FF00000000);
    extlen.push(length & 0x00000000FF000000);
    extlen.push(length & 0x0000000000FF0000);
    extlen.push(length & 0x000000000000FF00);
    extlen.push(length & 0x00000000000000FF);
  }
  extlen.unshift((mask << 7) | len);
  return extlen;
}

function _payload(maskbit, payload) {
  var i, mask, ret, length;
  if(maskbit) {
    mask = makeMask(), ret = mask.slice(-4), length = payload.length;
    for(i = 0; i < length; i++)
      ret.push(payload[i] ^ mask[i % 4]);
  } else
    ret = Array.prototype.slice.call(payload);

  return ret;

  function makeMask() {
    var i, ret = [];
    for(i = 4; i--;)
      ret.push(~~(Math.random() * 256));
    return ret;
  }
}
