
node-websockets
=

##### Web Socket Server and Client API

* supports only `draft-ietf-hybi-thewebsocketprotocol-10`.
* works with Google Chrome Dev Channel (>14.0.835.2) when using a browser as a WebSocket client.

Install
-

    npm i https://github.com/synquery/node-websockets.git


Usage
-

require `websockets`

```js
const websockets = require("websockets");

```

### _Server:_
Server is a wrapper of `http/https` server.

```js

// http based server
const server = websockets.createServer();
server.on('connect', function(socket) {
  socket.on('message', function(message) {
    socket.send('echo a message:' + message);
    ......
  });
}).listen(80);

// https based server
const secure = websockets.createServer({
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
const express = require('express');

const rest_svr = express.createServer();
rest_svr.get('/', function(req, res) {
  ......
});
svr.configure(function() {
  ......
});

const server = websockets.createServer({
  server: rest_svr
});
server.on('connect', function(socket) {
  socket.on('message', function(message) {
    socket.send('echo a message:' + message);
    ......
  });
}).listen(80);

```


### _Client:_
Client has the interfaces like [html5 WebSocket](http://www.w3.org/TR/2011/WD-websockets-20110419/).

```js
const socket = new websockets.WebSocket('wss://127.0.0.1');
or
const socket = new websockets.connect('wss://127.0.0.1');
socket.on('open', function() {
  socket.send('a message');
  ......
});
socket.on('message', ...)

```

APIs
-

### websockets.Server

<br/>

#### Event: 'connect'
__`function (socket) {}`__

Emitted when client-server opening handshake has succeeded. `socket` is an instance of `WebSocket`.
  
<br/>

#### server.broadcast(string, site)
Sends `string` to all clients connected with `server`.
if site sets "true", then, sends to clients access from same pathname.

<br/>

#### server.broadcast(buffer)
Not Implemented.
Sends binary data(`buffer`) to all clients connected with `server`.

<br/>

### websockets.WebSocket

<br/>

#### Event: 'open'
__`function () {}`__

Emitted when a client-server connection is successfully established.

<br/>

#### Event: 'message'
__`function (data) {}`__

Emitted when the socket has received a message. The type of `data` is either `string`(string data) or `Buffer`(binary data).

<br/>

#### Event: 'error'
__`function (exception) {}`__

Emitted on error. `exception` is an instance of Error.

<br/>

#### Event: 'close'
__`function () {}`__

Emitted when a client-server connection has closed.

<br/>

#### socket.send(string)
Sends `string` to the other endpoint.

<br/>

#### socket.send(buffer)
Sends binary data(`buffer`) to the other endpoint.

<br/>

#### socket.close()
Sends a connection close request to the other endpoint.

<br/>
TODO
=
* test of sending on binary mode.
