# jsonrpc-server

A simple and lightweight library for creating a JSON-RPC 2.0 compliant HTTP server.

Complies with the [JSON-RPC 2.0](http://www.jsonrpc.org/specification) and the [JSON-RPC 2.0 Transport: HTTP](https://www.simple-is-better.org/json-rpc/transport_http.html) specifications.

## Install

To install jsonrpc-server in the current directory, run:

```bash
npm install jsonrpc-server --save
```

## Usage

```javascript
const jsonrpc = require('jsonrpc-server');

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

jsonrpc.setMethod('sum', sum);
jsonrpc.setMethod('wait', wait);
jsonrpc.listen(9090); // listening on http://127.0.0.1:9090/
```

You can also specify a path to listen on:

```javascript
jsonrpc.listen(9090, '/api') // listening on http://127.0.0.1:9090/api
```

## Example Requests

Here are some example requests made against the server created above:

### Sum

```
POST / HTTP/1.1
Host: 127.0.0.1:9090
Content-Type: application/json
Accept: application/json
Content-Length: 56

{"jsonrpc":"2.0","id":1,"method":"sum","params":[1,2,3]}
```

```
connection: close
content-type: application/json
content-length: 35

 {"jsonrpc":"2.0","id":1,"result":6}
```

### Sum (Batched)

```
POST / HTTP/1.1
Host: 127.0.0.1:9090
Content-Type: application/json
Accept: application/json
Content-Length: 115

[{"jsonrpc":"2.0","id":1,"method":"sum","params":[1,2,3]},{"jsonrpc":"2.0","id":2,"method":"sum","params":[4,5,6]}]
```

```
connection: close
content-type: application/json
content-length: 74

[{"jsonrpc":"2.0","id":1,"result":6},{"jsonrpc":"2.0","id":2,"result":15}]
```

### Wait

```
POST / HTTP/1.1
Host: 127.0.0.1:9090
Content-Type: application/json
Accept: application/json
Content-Length: 59

{"jsonrpc":"2.0","id":1,"method":"wait","params":{"ms":50}}
```

```
connection: close
content-type: application/json
content-length: 38

{"jsonrpc":"2.0","id":1,"result":true}
```
