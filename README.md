# http-jsonrpc-server

[![Build Status](https://travis-ci.org/sangaman/http-jsonrpc-server.svg?branch=master)](https://travis-ci.org/sangaman/http-jsonrpc-server/)
[![Codacy Badge](https://api.codacy.com/project/badge/Grade/5f1e5b18def4469eaf22e3bb29a2dfa0)](https://www.codacy.com/app/sangaman/http-jsonrpc-server?utm_source=github.com&amp;utm_medium=referral&amp;utm_content=sangaman/http-jsonrpc-server&amp;utm_campaign=Badge_Grade)
[![dependencies Status](https://david-dm.org/sangaman/http-jsonrpc-server/status.svg)](https://david-dm.org/sangaman/http-jsonrpc-server)
[![devDependencies Status](https://david-dm.org/sangaman/http-jsonrpc-server/dev-status.svg)](https://david-dm.org/sangaman/http-jsonrpc-server?type=dev)

- [Install](#install)
- [Usage](#usage)
  - [Specifying a Path](#specifying-a-path)
  - [Optional Callbacks](#optional-callbacks)
  - [Adding/Updating Methods](#adding-updating-methods)
  - [Closing the Server](#closing-the-server)
  - [Native HTTP Server](#native-http-server)
  - [Exposed Constants](#exposed-constants)
- [API Documentation](#api-documentation)
- [Sample Requests](#sample-requests)
  - [Sum](#sum)
  - [Sum (Batched)](#sum--batched-)
  - [Wait](#wait)

A simple and lightweight library for creating a JSON-RPC 2.0 compliant HTTP server.

This package complies with the [JSON-RPC 2.0](http://www.jsonrpc.org/specification) and [JSON-RPC 2.0 Transport: HTTP](https://www.simple-is-better.org/json-rpc/transport_http.html) specifications.

## Install

To install http-jsonrpc-server in the current directory, run:

```bash
npm install http-jsonrpc-server --save
```

## Usage

Below is code to create a server with two exposed methods and begin listening on a given port.

```javascript
const RpcServer = require('http-jsonrpc-server');

function sum(arr) {
  let total = 0;
  for (let n = 0; n < arr.length; n += 1) {
    total += arr[n];
  }
  return total;
}

async function wait(params) {
  return new Promise((resolve) => {
    setTimeout(() => {
      resolve(true);
    }, params.ms);
  });
}

const rpcServer = new RpcServer({
  methods: {
    sum,
    wait,
  }
});
rpcServer.setMethod('sum', sum);
rpcServer.setMethod('wait', wait);
rpcServer.listen(9090).then(() => {
  console.log('server is listening at http://127.0.0.1:9090/');
}
```

### Specifying a Path

```javascript
const rpcServer = new RpcServer({
  path: '/api'
});
rpcServer.listen(9090).then(() => {
  console.log('server is listening at http://127.0.0.1:9090/api');
}
```

### Optional Callbacks

`onServerError` will be called if the server emits an [error](https://nodejs.org/api/net.html#net_event_error). `onRequest` and `onRequestError` will be called each time a method is called or throws an error.

```javascript
const rpcServer = new RpcServer({
  onServerError: (err) => {
    console.error('the server threw an error: ' + err)
  },
  onRequest: (request) => {
    console.log(JSON.stringify(request));
    // sample output: {"jsonrpc":"2.0","id":1,"method":"sum","params":[1,2,3]}
  },
  onRequestError = (err, id) => {
    console.error('request ' + id + ' threw an error: ' + err);
  },
});
```

### Adding/Updating Methods

You can register new methods or updates existing ones after the server has been created.

```javascript
rpcServer.setMethod('sum', sum);
```

### Closing the Server

```javascript
rpcServer.close().then(() => {
  console.log('server stopped listening');
}
```

### Native HTTP Server

You can access the underlying [http.Server](https://nodejs.org/api/http.html#http_class_http_server) object with `rpcServer.server`.

```javascript
if (rpcServer.server.listening) {
  console.log('server is listening');
}
```

### Exposed Constants

```javascript
console.log(rpcServer.PARSE_ERROR); // -32700
console.log(rpcServer.INVALID_REQUEST); // -32600
console.log(rpcServer.METHOD_NOT_FOUND); // -32601
console.log(rpcServer.INVALID_PARAMS); // -32602
console.log(rpcServer.SERVER_ERROR); // -32000
console.log(rpcServer.SERVER_ERROR_MAX); // -32099
```

## API Documentation

<a name="RpcServer"></a>

## RpcServer
Class representing a HTTP JSON-RPC server

**Kind**: global class

* [RpcServer](#RpcServer)
    * [new RpcServer(options)](#new_RpcServer_new)
    * [.setMethod(name, method)](#RpcServer+setMethod)
    * [.listen(port)](#RpcServer+listen) ⇒ <code>Promise</code>
    * [.close()](#RpcServer+close) ⇒ <code>Promise</code>

<a name="new_RpcServer_new"></a>

### new RpcServer(options)
Create an RpcServer


| Param | Type | Description |
| --- | --- | --- |
| options | <code>Object</code> | Optional parameters for the server. |
| options.methods | <code>Object</code> | A map of method names to functions. Method functions are passed one parameter which will either be an Object or a string array. |
| options.path | <code>Object</code> | The path for the server. |
| options.onRequestError | <code>function</code> | Callback for when requests are received, it is passed an Object representing the request. |
| options.onRequestError | <code>function</code> | Callback for when requested methods throw errors, it is passed an error and request id. |
| options.onServerError | <code>function</code> | Callback for server errors, it is passed an [Error](https://nodejs.org/api/errors.html#errors_class_error). |

<a name="RpcServer+setMethod"></a>

### rpcServer.setMethod(name, method)
Set a method

**Kind**: instance method of [<code>RpcServer</code>](#RpcServer)

| Param | Type | Description |
| --- | --- | --- |
| name | <code>string</code> | The name of the method |
| method | <code>function</code> | The function to be called for this method. Method functions are passed one parameter which will either be an Object or a string array. |

<a name="RpcServer+listen"></a>

### rpcServer.listen(port) ⇒ <code>Promise</code>
Begin listening on a given port

**Kind**: instance method of [<code>RpcServer</code>](#RpcServer)
**Returns**: <code>Promise</code> - A promise that resolves to true once the server is listening. On error or
invalid port number the promise will be rejected with an [Error](https://nodejs.org/api/errors.html#errors_class_error).

| Param | Type | Description |
| --- | --- | --- |
| port | <code>number</code> | The port number to listen on |

<a name="RpcServer+close"></a>

### rpcServer.close() ⇒ <code>Promise</code>
Stop listening on all ports

**Kind**: instance method of [<code>RpcServer</code>](#RpcServer)
**Returns**: <code>Promise</code> - A promise that resolves to true once the server stops listening. On error
the promise will be rejected with an [Error](https://nodejs.org/api/errors.html#errors_class_error).

## Sample Requests

Here are some sample requests made against the server created in the first [usage](#usage) example.

### Sum

```http
POST / HTTP/1.1
Host: 127.0.0.1:9090
Content-Type: application/json
Accept: application/json
Content-Length: 56

{"jsonrpc":"2.0","id":1,"method":"sum","params":[1,2,3]}
```

```http
connection: close
content-type: application/json
content-length: 35

 {"jsonrpc":"2.0","id":1,"result":6}
```

### Sum (Batched)

```http
POST / HTTP/1.1
Host: 127.0.0.1:9090
Content-Type: application/json
Accept: application/json
Content-Length: 115

[{"jsonrpc":"2.0","id":1,"method":"sum","params":[1,2,3]},{"jsonrpc":"2.0","id":2,"method":"sum","params":[4,5,6]}]
```

```http
connection: close
content-type: application/json
content-length: 74

[{"jsonrpc":"2.0","id":1,"result":6},{"jsonrpc":"2.0","id":2,"result":15}]
```

### Wait

```http
POST / HTTP/1.1
Host: 127.0.0.1:9090
Content-Type: application/json
Accept: application/json
Content-Length: 59

{"jsonrpc":"2.0","id":1,"method":"wait","params":{"ms":50}}
```

```http
connection: close
content-type: application/json
content-length: 38

{"jsonrpc":"2.0","id":1,"result":true}
```
