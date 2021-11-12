/***/
var Server = require('./server');
var Socket = require('./socket');

module.exports = Socket;
// var WebSocket = require('websockets');

Socket.Server = Server;
Socket.WebSocket = Socket;

Socket.createServer = function(opts) {
  return new Server(opts);
};

Socket.connect = function(opts) {
  return new Socket(opts);
};
