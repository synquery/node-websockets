/***/
var Server = require('./server');
var Socket = require('./socket');

exports.Server = Server;
exports.WebSocket = Socket;

exports.createServer = function(opts) {
  return new Server(opts);
};
exports.connect = function(opts) {
  return new Socket(opts);
};