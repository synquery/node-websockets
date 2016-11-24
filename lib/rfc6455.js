/***/
var util = require('util'), events = require('events'), crypto = require('crypto');
var URL = require('url'), http = require('http'), https = require('https');

var GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';
var HANDSHAKE_RESPONSE = 'HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ';
var ERR_400 = 'HTTP/1.1 400 Bad Request\r\n\r\n400 Bad Request';
var ERR_403 = 'HTTP/1.1 403 Forbidden\r\n\r\n403 Forbidden';
var ERR_426 = 'HTTP/1.1 426 Upgrade Required\r\n\r\n426 Upgrade Required';

module.exports = exports = Rfc6455;

function Rfc6455(arg0, arg1) {

  // Server: req, socket, upgradeHead, opts
  // Client: url, opts

  var self = this;
  events.EventEmitter.call(self);

  var isClient = 'string' === typeof arg0;

  var Core = isClient ? Client: Server;
  self.core = new Core(self);

  // writing queue
  self._wq = [];

  var opts = self._options = (isClient ? arguments[1]: arguments[3]) || {};
  if('string' === typeof opts)
    opts = self._options = {
      protocols: [opts]
    };
  else if('array' === typeof opts)
    opts = self._options = {
      protocols: opts
    };

  // buffering size when send
  var bufSize = opts['bufferSize'];
  if(typeof bufSize != 'number' || bufSize <= 0)
    bufSize = opts['bufferSize'] = Limits.BUFFER_SIZE;

  // max size to receive
  var maxSize = opts['receivableSize'];
  if(typeof maxSize != 'number' || maxSize <= 0)
    maxSize = opts['receivableSize'] = Limits.RECEIVABLE_SIZE;

  self.isSizeExceeded = maxSize == Infinity ? Function(): function(buf) {
    return buf.length > maxSize;
  };

}
util.inherits(Rfc6455, events.EventEmitter);

function _option(key) {
  return this._options[key];
}

function Server(parent) {
  this.parent = parent;
}
function Client(parent) {
  this.parent = parent;
}

Rfc6455.prototype.accumulate = function(data, fin, opcode) {
  var rfc6455 = this;

  // incoming data receiver
  // one protocol, one buffer so that if a large data
  // is transferred, stuck the connection. Be careful.
  // (~7MB/s @ Intel Core i7 2GHz )
  if(0 !== opcode)
    rfc6455.opcode = opcode, rfc6455.buffer = new Buffer(0);
  else if(!rfc6455.buffer)
    return; // overflowing frames

  var bufd = new Buffer(data);
  rfc6455.buffer = Buffer.concat([rfc6455.buffer, bufd]);

  // over receivable capacity
  // default: Infinity
  if(rfc6455.isSizeExceeded(rfc6455.buffer)) {
    rfc6455.buffer = null;
    rfc6455.emit('error', new Error('EMAXSIZE: Buffering size exceeded > '
      + _option.call(rfc6455, 'receivableSize') + ' bytes'));
    return;
  }

  // emit raw data snippet, slower
  // self.emit('data', bufd, fin, self.opcode);
  if(!fin)
    return;

  // emit message event
  var m = 1 === rfc6455.opcode ? rfc6455.buffer.toString(): rfc6455.buffer;
  rfc6455.buffer = null, rfc6455.emit('message', m);
};

// ---------------------------------------------------
// close
// ---------------------------------------------------
Server.prototype.close = function(reason) {
  close.call(this, reason, 0);
};
Client.prototype.close = function(reason) {
  close.call(this, reason, 1);
};
Rfc6455.prototype.close = function(reason) {
  this.core.close(reason);
};
function close(reason, maskbit) {
  var self = this, parent = self.parent;
  if(!parent.socket)
    return;
  var message = ERR_CODE[reason] || (reason + '');
  _ctrl.call(self, OPCODE['close'], maskbit, message);

  parent.close = function() {
    var socket = parent.socket;
    socket.writable && socket.end();
    socket.destroy();
  };
}

//---------------------------------------------------
//ping
//---------------------------------------------------
Server.prototype.ping = function(mess) {
  ping.call(this, mess, 0);
};
Client.prototype.ping = function(mess) {
  ping.call(this, mess, 1);
};
Rfc6455.prototype.ping = function(mess) {
  this.core.ping(mess);
};
function ping(mess, maskbit) {
  var self = this, parent = self.parent;
  _ctrl.call(self, OPCODE['ping'], maskbit, mess);
}

// ---------------------------------------------------
// Control Frames
// ---------------------------------------------------
function _ctrl(opcode, maskbit, data) {

  var parent = this.parent, buf = new Buffer(data);
  if(125 < buf.length)
    buf = buf.slice(0, 124);

  var fin = 1, ext = [0x00, 0x00, 0x00];
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
Rfc6455.prototype.write = function(massage) {
  this.core.write(massage);
};
function write(message, maskbit) {
  var parent = this.parent, socket = parent.socket;
  var wq = parent._wq;

  var buf = Buffer.isBuffer(message) ? message: new Buffer(message);
  var buf_len = buf.length;

  var pos = 0, size = parent._options['bufferSize'];
  var fin = 0;
  var ext = [0, 0, 0];
  var opcode = OPCODE[typeof message] || OPCODE['binary'];
  var mask = maskbit;

  var maxtd = parseInt((process.maxTickDepth || 1000) / 10), tickr = maxtd;
  wq.push(tickNextFrame), wq.length == 1 && wq[0]();

  function nextQueue() {
    wq.shift(), wq.length && wq[0]();
  }

  function tickNextFrame() {

    var tail = Math.min(buf_len, pos + size);
    fin = buf_len > tail ? 0: 1;

    var f_data = buf.slice(pos, (pos = tail));
    tickr-- ? process.nextTick(function() {
      socketWrite(f_data);
    }): setImmediate(function() {
      socketWrite(f_data), tickr = maxtd;
    });

  }

  function socketWrite(f_data, after_sigh) {

    if(socket.destroyed) // no more write
      return nextQueue();

    if(!socket.writable) // breathe a sigh, to busy network
      return after_sigh ? nextQueue(): setTimeout(function() {
        socketWrite(f_data, true);
      }, 3000);

    socket.write(frame(fin, ext, opcode, mask, f_data), function() {
      // http://www.hcn.zaq.ne.jp/___/WEB/RFC6455-ja.html#section-5.4
      opcode = OPCODE['continuation'];
      fin === 0 ? tickNextFrame(): nextQueue();
    });

  }

}

// ---------------------------------------------------
// pong
// ---------------------------------------------------
Rfc6455.prototype.pong = Rfc6455.prototype.write;

// ---------------------------------------------------
// parse
// ---------------------------------------------------
Server.prototype.parse = function(data) {
  parse.call(this, data, 1);
};
Client.prototype.parse = function(data) {
  parse.call(this, data, 0);
};
Rfc6455.prototype.parse = function(data) {
  this.core.parse(data);
};
function parse(data, maskbit) {
  var self = this, parent = self.parent, i = 0;

  var OP_FUNC = {

    _def: function(payload, fin, opcode) {
      parent.accumulate(payload, fin, opcode);
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
      parent.pong(payload); // TODO
    },
    0x0A: function pong(payload) {
      parent.emit('pong', Buffer(payload).toString());
    }

  };

  var buf = self.buffer;
  if(Buffer.isBuffer(buf)) {
    data = Buffer.concat([buf, data]), delete self.buffer; // kick parse head
  }

  if('undefined' === typeof self.buffer)
    self.buffer = _parseHead();

  if(!Buffer.isBuffer(self.buffer))
    _parsePayload();

  function _parseHead() {
    var length = data.length;
    if(length < 2)
      return data;
    var _byte = data[i++];
    var fin = _byte >>> 7;
    var ope = (_byte & 0x0F);

    _byte = data[i++];
    var mask = _byte >>> 7;
    if(maskbit !== mask)
      return parent.emit('error', 1002);
    var len = _byte & 0x7F;

    if(length < 2 + ({
      "126": 2,
      "127": 8
    } || 0)[len] + (maskbit ? 4: 0))
      return data;

    if(127 === len)
      len = ((data[i++] << 24) + (data[i++] << 16) + (data[i++] << 8) + data[i++])
        * Math.pow(2, 32)
        + (data[i++] << 24)
        + (data[i++] << 16)
        + (data[i++] << 8) + data[i++];
    else if(126 === len)
      len = (data[i++] << 8) + data[i++];

    var maskkey = maskbit ? [data[i++], data[i++], data[i++], data[i++]]: null;

    return {
      fin: fin,
      ope: ope,
      length: len,
      mask: maskkey,
      payload: []
    };
  }

  function _parsePayload() {
    var buf = self.buffer, len = data.length;
    var payload = buf.payload, maskkey = buf.mask, ope = buf.ope, fin = buf.fin;

    var j = payload.length % 4;
    for(; buf.length && i < len; j++, buf.length--)
      payload.push(maskkey ? data[i++] ^ maskkey[j % 4]: data[i++]);

    if('function' !== typeof OP_FUNC[ope])
      return parent.emit('error', 1002);

    try {

      if(0 === buf.length) {
        OP_FUNC[ope](payload, !!fin);
        delete self.buffer;
      }

      // TODO test
      if(i < len)
        parse.call(self, data.slice(i), maskbit);

    } catch(e) {
      /* for debug parse error
      console.log(Date());
      console.log(data);
      console.log('E:length:' + data.length);
      console.log('E:i:' + i);
      console.log('E:mask:' + maskbit);
      */
      console.error(e);
      throw e;
    }

  }
}

// ---------------------------------------------------
// hand shake
// ---------------------------------------------------
Rfc6455.prototype.handShake = function() {
  var core = this.core;
  core.handShake.apply(core, arguments);
};
Server.prototype.handShake = function(req, socket, upgradeHead) {
  var parent = this.parent, head = req['headers'];
  parent.socket = socket;

  var i, keys = ['host', 'sec-websocket-key', 'upgrade'];
  for(i = keys.length; i--;)
    if(!(keys[i] in head))
      return socket.write(ERR_400);
  if('websocket' !== head['upgrade'].toLowerCase())
    return socket.write(ERR_400);
  if('13' !== head['sec-websocket-version'])
    // TODO version 8 is ok ?
    return socket.write(ERR_426);
  if(true !== _isAllowed())
    return socket.write(ERR_403);

  // TODO
  head['sec-websocket-protocol'], head['cookie'];

  var open = true, close = function() {
    if(open)
      open = false, parent.emit('close');
  };

  var newkey = _hashAndEncode(head['sec-websocket-key']);
  socket.write(new Buffer(HANDSHAKE_RESPONSE + newkey + '\r\n\r\n'));
  // TODO this nextTick is really truth ?
  process.nextTick(function() {
    socket.on('close', close);
    socket.on('end', close);
    socket.on('data', function(data) {
      parent.parse(data);
    });
    parent.emit('connect', socket);
  });

  function _isAllowed() {
    var validate = parent._options['validateOrigin'];
    return 'function' === typeof validate ? validate(head): true;
  }
};
Client.prototype.handShake = function(uri) {
  var parent = this.parent, url = URL.parse(uri);
  parent.URL = uri;

  var secure = parent.secure = 'wss:' === url['protocol'];

  var path = url['pathname'] || '/';
  path += (url['search'] || '').replace(/#/, '%23');
  path += (url['hash'] || '');

  var key = _createKey();

  var opts = {
    port: url['port'] || (secure ? 443: 80),
    host: url['hostname'],
    path: path,
    headers: {
      Connection: 'Upgrade',
      Upgrade: 'websocket',
      'Sec-Websocket-Key': key,
      'Sec-Websocket-Origin': 'node-websockets',
      'Sec-Websocket-Version': 13
    }
  };

  if(secure) {
    opts['key'] = parent._options['key'];
    opts['cert'] = parent._options['cert'];
    opts['ca'] = parent._options['ca'];
    var rejectUnauthorized = parent._options['rejectUnauthorized'];
    opts['rejectUnauthorized'] = typeof rejectUnauthorized === 'boolean'
      ? rejectUnauthorized: false;
  }

  var prtcl = secure ? https: http, agent;
  if(parent._options.agent) {
    opts['agent'] = parent._options.agent;
  }
  if(prtcl.getAgent) {
    agent = opts['agent'] || prtcl.getAgent(opts['host'], opts['port']);
    opts['agent'] = agent;
  }

  var req = prtcl.request(opts);
  req.end();

  var newkey = _hashAndEncode(key);
  (agent = agent || req).on('upgrade', function(res, socket, upgradeHead) {
    parent.socket = socket;

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

// http://www.hcn.zaq.ne.jp/___/WEB/RFC6455-ja.html
// 0  Continuation Frame
// 1  Text Frame
// 2  Binary Frame
// 8  Connection Close Frame
// 9  Ping Frame
// 10 Pong Frame
var OPCODE = {
  continuation: 0x0,
  string: 0x1,
  binary: 0x2,
  close: 0x8,
  ping: 0x9,
  pong: 0xA
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

var Limits = {
  // 2MB
  BUFFER_SIZE: 2 << 20,
  // Infinity
  RECEIVABLE_SIZE: Infinity
};

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
  arr = arr.concat(_payload(mask, payload));

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
    extlen.push(length >>> 8);
    extlen.push(length & 0xFF);
  } else {
    len = 127;
    // var zerofill =
    // '0000000000000000000000000000000000000000000000000000000000000000';
    var zerofill = '000000000000000000000000000000000000000000000000';
    var bin = (zerofill + length.toString(2)).slice(-64);
    extlen.push(parseInt(bin.substr(0, 8), 2));
    extlen.push(parseInt(bin.substr(8, 8), 2));
    extlen.push(parseInt(bin.substr(16, 8), 2));
    extlen.push(parseInt(bin.substr(24, 8), 2));
    extlen.push(parseInt(bin.substr(32, 8), 2));
    extlen.push(parseInt(bin.substr(40, 8), 2));
    extlen.push(parseInt(bin.substr(48, 8), 2));
    extlen.push(parseInt(bin.substr(56, 8), 2));
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
