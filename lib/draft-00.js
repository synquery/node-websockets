/***/
var util = require('util'), events = require('events'), crypto = require('crypto');
var URL = require('url');

var HANDSHAKE_RESPONSE = 'HTTP/1.1 101 WebSocket Protocol Handshake\r\nUpgrade: WebSocket\r\nConnection: Upgrade\r\n';

module.exports = exports = Draft00;

function Draft00(arg0, arg1) {
  var self = this;
  events.EventEmitter.call(self);

  var isClient = 'string' === typeof arg0;
  // console.log('isClient?', isClient);

  var Core = isClient ? Client: Server;
  self.core = new Core(self);

  var opts = self._options = (isClient ? arguments[1]: arguments[3]) || {};
  if('string' === typeof opts)
    opts = self._options = {
      protocols: [opts]
    };
  else if(Array.isArray(opts))
    opts = self._options = {
      protocols: opts
    };
}
util.inherits(Draft00, events.EventEmitter);

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
  close.call(this, reason);
};
Draft00.prototype.close = function(reason) {
  this.core.close(reason);
};
function close(reason, maskbit) {
  // console.log('[draft-00.js] call close.', reason, maskbit);
  var socket = this.parent.socket;
  socket.writable && socket.end();
  socket.destroy();
}

//---------------------------------------------------
//ping
//---------------------------------------------------
Server.prototype.ping = function(mess) {
  this.parent.emit('pong', mess);
};
Client.prototype.ping = function() {
};
Draft00.prototype.ping = function(mess) {
  this.core.ping(mess);
};

// ---------------------------------------------------
// write
// ---------------------------------------------------
Server.prototype.write = function(massage) {
  write.call(this, massage);
};
Draft00.prototype.write = function(massage) {
  this.core.write(massage);
};
function write(message, maskbit) {
  var socket = this.parent.socket;

  var length = Buffer.byteLength(message);
  var mess = new Buffer(length + 2);

  mess[0] = 0;
  mess.write(message, 1);
  mess[length + 1] = 0xFF;

  socket.write(mess);

}

// ---------------------------------------------------
// parse
// ---------------------------------------------------
Server.prototype.parse = function(data) {
  parse.call(this, data);
};
Draft00.prototype.parse = function(data) {
  this.core.parse(data);
};
function parse(data) {
  var self = this, parent = self.parent;
  self.buffer = self.buffer || [];

  var i = 0, l = data.length;

  try {
    frame();
  } catch(err) {
    parent.close();
  }

  function frame() {
    var type = self.type == null ? self.type = data[i++]: self.type;
    var sb = type >>> 7;
    if(sb) {
      if(0xFF !== type)
        throw new Error();// abort
      var length = 0, b;
      for(; i < l && b !== 0; i++)
        b = _length(data[i]);

    } else {
      if(0 !== type)
        throw new Error();// abort
      for(; i < l;) {
        var b = data[i++];
        0xFF === b ? _flush(): _data(b);
      }
    }

    function _data(d) {
      self.buffer.push(d);
    }
    function _length(d) {
      // TODO
    }
    function _flush() {
      var mess = self.buffer;
      parent.emit('message', Buffer(mess).toString());
      self.buffer = [], self.type = null;
      if(i < l)
        frame();
    }
  }
}

// ---------------------------------------------------
// hand shake
// ---------------------------------------------------
Draft00.prototype.handShake = function() {
  var core = this.core;
  core.handShake.apply(core, arguments);
};
Server.prototype.handShake = function(req, socket, upgradeHead) {
  var parent = this.parent, head = req['headers'];
  parent.socket = socket;

  if('WebSocket' !== head['upgrade'] || 'Upgrade' !== head['connection'])
    return socket.write(ERR_400);

  var host = head['host'], _origin = head['origin'];
  var _key1 = head['sec-websocket-key1'], _key2 = head['sec-websocket-key2'];
  var _key3 = upgradeHead;
  var _secure = !!req.socket.encrypted;
  var protocol = _secure ? 'wss://': 'ws://';

  var url = URL.parse(protocol + host);
  var _host = url.hostname, _port = url.port, _resource = url.pathname;
  // console.log('[draft-00.js] _key1: ', _key1, _key1.length);
  // console.log('[draft-00.js] _key2: ', _key2, _key2.length);
  // console.log('[draft-00.js] _key3: ', _key3, _key3.length);

  var _location = protocol + _host;
  if(_port && +_port !== (_secure ? 443: 80))
    _location += ':' + _port;
  _location += req.url;

  function makeKey(key) {

    var num = '', cnt = 0;
    key.split('').forEach(function(c) {
      if(c == '\u0020')
        return cnt++;
      if(/\d/.test(c))
        return num += c;
    });

    num = num / cnt;
    return Buffer([num >> 24, num >> 16, num >> 8, num]);;

  }

  var open = true, close = function() {
    //    var i = 0, fn = close;
    //    while(fn.caller) {
    //      console.log(++i + ':', fn.caller);
    //      fn = fn.caller;
    //    }
    if(!open) {
      return;
    }
    open = false, parent.emit('close');
  };

  var _buf1 = makeKey(_key1), _buf2 = makeKey(_key2);
  // console.log('[draft-00.js] parts: ', _buf1, _buf1.length);
  // console.log('[draft-00.js] parts: ', _buf2, _buf2.length);

  var head = HANDSHAKE_RESPONSE;
  head += 'Sec-WebSocket-Origin: ' + _origin + '\r\n';
  head += 'Sec-WebSocket-Location: ' + _location + '\r\n\r\n';

  var body, hash = crypto.createHash('md5');
  hash.update(Buffer.concat([_buf1, _buf2, _key3]), 'binary');
  body = hash.digest();

  // console.log('[draft-00.js] head: ', head, head.length);
  // console.log('[draft-00.js] body: ', body, body.length);

  // write for establish hand-shake!
  socket.write(Buffer.concat([new Buffer(head, 'utf8'), body]), 'binary');

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
