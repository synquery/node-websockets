node-websockets
=

##### Web Socket Server and Client API

* supports only `draft-ietf-hybi-thewebsocketprotocol-10`.
* works with Google Chrome Dev Channel (>14.0.835.2) when using a browser as a WebSocket client.

Install
-

    npm install websockets


Usage
-

require `websockets`

```js
var websockets = require("websockets");

```

#### Server:
Server is a wrapper of `http/https` server.

```js

// http based server
var server = websockets.createServer();
server.on('connect', function(socket) {
  socket.on('message', function(message) {
    socket.send('echo a message:' + message);
    ......
  });
}).listen(80);

// https based server
var secure = websockets.createServer({
  key: ssl_key,
  cert: ssl_cert
});
secure.on('connect', function(socket) {
  ......
}).listen(443);


```

Extended Servers such as [express](http://expressjs.com/) are also available.

```js
// In case of 'express'
var express = require('express');

var svr = express.createServer();
svr.get('/', function(req, res) {
  ......
});
svr.configure(function() {
  ......
});

var server = websockets.createServer({
  server: svr
});
server.on('connect', function(socket) {
  socket.on('message', function(message) {
    socket.send('echo a message:' + message);
    ......
  });
}).listen(80);

```


#### Client:
Client has the interfaces like [html5 WebSocket](http://www.w3.org/TR/2011/WD-websockets-20110419/).

```js
var socket = new websockets.WebSocket('wss://127.0.0.1');
socket.on('open', function() {
  socket.send('a message');
  ......
});

```

APIs
-

#### websockets.Server

##### Event: 'connect'
`function (socket) {}`

Emitted when client-server opening handshake has succeeded. `socket` is an instance of `WebSocket`.

##### server.broadcast(string)
Not Implemented.
Sends `string` to all clients connected with `server`.

##### server.broadcast(buffer)
Not Implemented.
Sends binary data(`buffer`) to all clients connected with `server`.


#### websockets.WebSocket

##### Event: 'open'
`function () {}`

Emitted when a client-server connection is successfully established.

##### Event: 'message'
`function (data) {}`

Emitted when the socket has received a message. The type of `data` is either `string`(string data) or `Buffer`(binary data).

##### Event: 'error'
`function (exception) {}`

Emitted on error. `exception` is an instance of Error.

##### Event: 'close'
`function () {}`

Emitted when a client-server connection has closed.

##### socket.send(string)
Sends `string` to the other endpoint.

##### socket.send(buffer)
Sends binary data(`buffer`) to the other endpoint.

##### socket.close()
Sends a connection close request to the other endpoint.

TODO
=
* implementation of server broadcast
