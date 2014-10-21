/***/
var http = require('http'), https = require('https');
var events = require('events'), util = require('util');

var Socket = require('./socket');

module.exports = WebSocketServer;

var evts = ['request', 'connection', 'close', 'checkContinue', 'upgrade',
  'clientError'];
var fncs = ['listen', 'close'];

function WebSocketServer(options) {
  var self = this;
  events.EventEmitter.call(self);

  var server, opts = 'object' === typeof options ? options: {};

  if('server' in opts)
    server = opts['server'], delete opts['server'];

  else {
    var prtcl = 'key' in opts && 'cert' in opts ? https: http;
    server = prtcl.createServer.apply(prtcl, arguments);
  }

  evts.forEach(function(evt) {
    _bubble(evt, server, self);
  });

  fncs.forEach(function(fnc) {
    _wrap(fnc, server, self);
  });

  var connections = {};

  self.on('upgrade', function(req, socket, upgradeHead) {
    var conn = new Socket(req, socket, upgradeHead, opts);
    var _socket = conn._socket = socket.soket || socket;
    var site = req.url, port = _socket.remotePort;

    conn._req = req;

    conn.on('open', function() {
      var internal = connections[site] = connections[site] || [];
      // conn['_id'] = port;
      internal.push(conn);
      // TODO check delete ok
      /*
      self.emit('connect', conn);
      self.emit('handShake', conn);
      */
    });

    conn.on('close', function() {
      var internal = connections[site] || [];
      var index = internal.indexOf(conn);
      0 <= index && internal.splice(index, 1);

      self.emit('release');
    });

    conn.on('broadcast', function(message, options) {
      options = options || {};
      if(options.conn)
        options.conn = conn;
      if(options.site)
        options.site = site;
      self.emit('broadcast', message, options);
    });

    self.emit('connect', conn);
    self.emit('handShake', conn);

  });

  self.on('broadcast', function(message, options) {
    var type = options.type, conn = options.conn, site = options.site;
    var broadfn = conn ? distribute: broadcast;

    var exec = typeof options.exec == 'function' ? options.exec: function(conn,
      message, type) {
      conn.send(message, type);
    };

    if(!site)
      for( var i in connections)
        broadfn(connections[i]);

    else if(typeof site == 'string')
      broadfn(connections[site]);

    else if(typeof site.test == 'function')
      for( var i in connections)
        site.test(i) && broadfn(connections[i]);

    else
      throw new Error('unexpected site: ' + site);
    function broadcast(cons) {
      for( var i in cons)
        exec(cons[i], message, type);
    }
    function distribute(cons) {
      for( var i in cons) {
        if(cons[i] == conn)
          continue;
        exec(cons[i], message, type);
      }
    }
  });
}
util.inherits(WebSocketServer, events.EventEmitter);

WebSocketServer.prototype.broadcast = function(message, options) {
  this.emit('broadcast', message, options || '');
};

function _bubble(evt, from, to) {
  from.on(evt, function() {
    var args = Array.prototype.slice.call(arguments);
    args.unshift(evt), to.emit.apply(to, args);
  });
}

function _wrap(fnc, from, to) {
  to[fnc] = function() {
    return from[fnc].apply(from, arguments);
  };
}
