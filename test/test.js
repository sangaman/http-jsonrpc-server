/* eslint-env mocha */
/* eslint no-await-in-loop: 0 */

const assert = require('assert');
const request = require('supertest');
const RpcServer = require('../lib/http-jsonrpc-server');

function sum(arr) {
  let total = 0;
  for (let n = 0; n < arr.length; n += 1) {
    if (typeof arr[n] !== 'number') {
      throw new Error('parameters must be an array of numbers');
    }
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

const testPath = '/testpath';

describe('constructor', () => {
  let rpcServer;

  it('should return an RpcServer object for valid options', () => {
    const onRequest = () => 'request';
    const onError = () => 'error';
    const methods = {
      sum,
      wait,
    };
    rpcServer = new RpcServer({
      onError,
      onRequest,
      methods,
      path: testPath,
    });
    assert.ok(rpcServer instanceof RpcServer);
    assert.strictEqual(rpcServer.onError, onError);
    assert.strictEqual(rpcServer.onRequest, onRequest);
    assert.strictEqual(rpcServer.methods, methods);
    assert.strictEqual(rpcServer.path, testPath);
  });

  it('should error path with invalid characters', () => {
    assert.throws(() => new RpcServer({
      path: '/invalid<>',
    }));
  });

  it('should error path not starting with "/"', () => {
    assert.throws(() => new RpcServer({
      path: 'testpath',
    }));
  });

  it('should error methods that is not a map of functions', () => {
    assert.throws(() => new RpcServer({
      methods: 'here are some methods',
    }));
    assert.throws(() => new RpcServer({
      methods: {
        method1: 'not a function',
      },
    }));
  });

  it('should error onRequest that is not a function', () => {
    assert.throws(() => new RpcServer({
      onRequest: 'not a function',
    }));
  });

  it('should error onError that is not a function', () => {
    assert.throws(() => new RpcServer({
      onError: 'not a function',
    }));
  });
});

describe('handling requests', () => {
  const rpcServer = new RpcServer({
    methods: {
      sum,
      wait,
    },
  });

  it('should 404 an unknown path', () => request(rpcServer.server)
    .post('/invalidpath')
    .expect(404));

  it('should 405 GET requests', () => request(rpcServer.server)
    .get('/')
    .expect(405));

  it('should 415 non application/json requests', () => request(rpcServer.server)
    .post('/')
    .expect(415));

  it('should error invalid json', () => request(rpcServer.server)
    .post('/')
    .set('Accept', 'application/json')
    .set('Content-Type', 'application/json')
    .send('asdlkfjasld')
    .expect(200)
    .expect('Content-Type', 'application/json')
    .then((response) => {
      assert.strictEqual(response.body.jsonrpc, '2.0');
      assert.strictEqual(response.body.result, undefined);
      assert.strictEqual(response.body.error.code, RpcServer.PARSE_ERROR);
    }));

  it('should error invalid jsonrpc', () => request(rpcServer.server)
    .post('/')
    .set('Accept', 'application/json')
    .set('Content-Type', 'application/json')
    .send('{"jsonrpc":"1.0","id":1,"method":"sum"}')
    .expect(200)
    .expect('Content-Type', 'application/json')
    .then((response) => {
      assert.strictEqual(response.body.jsonrpc, '2.0');
      assert.strictEqual(response.body.result, undefined);
      assert.strictEqual(response.body.id, 1);
      assert.strictEqual(response.body.error.code, RpcServer.INVALID_REQUEST);
    }));

  it('should error invalid id', () => request(rpcServer.server)
    .post('/')
    .set('Accept', 'application/json')
    .set('Content-Type', 'application/json')
    .send('{"jsonrpc":"2.0","id":["ids should not be arrays"],"method":"sum"}')
    .expect(200)
    .expect('Content-Type', 'application/json')
    .then((response) => {
      assert.strictEqual(response.body.jsonrpc, '2.0');
      assert.strictEqual(response.body.result, undefined);
      assert.strictEqual(response.body.error.code, RpcServer.INVALID_REQUEST);
    }));

  it('should error invalid method', () => request(rpcServer.server)
    .post('/')
    .set('Accept', 'application/json')
    .set('Content-Type', 'application/json')
    .send('{"jsonrpc":"2.0","id":2,"method":123}')
    .expect(200)
    .expect('Content-Type', 'application/json')
    .then((response) => {
      assert.strictEqual(response.body.jsonrpc, '2.0');
      assert.strictEqual(response.body.result, undefined);
      assert.strictEqual(response.body.id, 2);
      assert.strictEqual(response.body.error.code, RpcServer.METHOD_NOT_FOUND);
    }));

  it('should error invalid params', () => request(rpcServer.server)
    .post('/')
    .set('Accept', 'application/json')
    .set('Content-Type', 'application/json')
    .send('{"jsonrpc":"2.0","id":3,"method":"sum","params":"params should not be a string"}')
    .expect(200)
    .expect('Content-Type', 'application/json')
    .then((response) => {
      assert.strictEqual(response.body.jsonrpc, '2.0');
      assert.strictEqual(response.body.result, undefined);
      assert.strictEqual(response.body.id, 3);
      assert.strictEqual(response.body.error.code, RpcServer.INVALID_PARAMS);
    }));

  it('should error on invalid input', () => request(rpcServer.server)
    .post('/')
    .set('Accept', 'application/json')
    .set('Content-Type', 'application/json')
    .send('{"jsonrpc":"2.0","id":12,"method":"sum","params":["a","b","c"]}')
    .expect(200)
    .expect('Content-Type', 'application/json')
    .then((response) => {
      assert.strictEqual(response.body.jsonrpc, '2.0');
      assert.strictEqual(response.body.result, undefined);
      assert.strictEqual(response.body.error.code, RpcServer.SERVER_ERROR);
      assert.strictEqual(response.body.id, 12);
    }));

  it('should return expected result for valid request', () => request(rpcServer.server)
    .post('/')
    .set('Accept', 'application/json')
    .set('Content-Type', 'application/json')
    .send('{"jsonrpc":"2.0","id":4,"method":"sum","params":[1,2,3]}')
    .expect(200)
    .expect('Content-Type', 'application/json')
    .then((response) => {
      assert.strictEqual(response.body.jsonrpc, '2.0');
      assert.strictEqual(response.body.error, undefined);
      assert.strictEqual(response.body.id, 4);
      assert.strictEqual(response.body.result, 6);
    }));

  it('should return nothing for notifications', () => request(rpcServer.server)
    .post('/')
    .set('Accept', 'application/json')
    .set('Content-Type', 'application/json')
    .send('{"jsonrpc":"2.0","method":"sum","params":[1,2,3]}')
    .expect(204)
    .expect('Content-Length', '0')
    .then((response) => {
      assert.strictEqual(response.body, '');
    }));

  it('should return batched results for valid requests', () => request(rpcServer.server)
    .post('/')
    .set('Accept', 'application/json')
    .set('Content-Type', 'application/json')
    .send('[{"jsonrpc":"2.0","id":5,"method":"sum","params":[1,2,3]},{"jsonrpc":"2.0","id":6,"method":"sum","params":[4,5,6]}]')
    .expect(200)
    .expect('Content-Type', 'application/json')
    .then((response) => {
      assert.ok(Array.isArray(response.body));
      assert.strictEqual(response.body.length, 2);
      for (let n = 0; n < response.body.length; n += 1) {
        assert.strictEqual(response.body[n].jsonrpc, '2.0');
        assert.strictEqual(response.body[n].error, undefined);
        if (response.body[n].id === 5) {
          assert.strictEqual(response.body[n].result, 6);
        } else if (response.body[n].id === 6) {
          assert.strictEqual(response.body[n].result, 15);
        } else {
          assert.fail('unexpected id value');
        }
      }
      assert.strictEqual(response.body[0].jsonrpc, '2.0');
      assert.strictEqual(response.body[0].error, undefined);
      assert.strictEqual(response.body[0].result, 6);
      assert.strictEqual(response.body[1].jsonrpc, '2.0');
      assert.strictEqual(response.body[1].error, undefined);
      assert.strictEqual(response.body[1].result, 15);
    }));

  it('should call an async method', () => request(rpcServer.server)
    .post('/')
    .set('Accept', 'application/json')
    .set('Content-Type', 'application/json')
    .send('{"jsonrpc":"2.0","id":7,"method":"wait","params":{"ms":50}}')
    .expect(200)
    .expect('Content-Type', 'application/json')
    .then((response) => {
      assert.strictEqual(response.body.jsonrpc, '2.0');
      assert.strictEqual(response.body.error, undefined);
      assert.strictEqual(response.body.id, 7);
      assert.ok(response.body.result);
    }));
});

describe('custom path', () => {
  const rpcServer = new RpcServer({
    methods: {
      sum,
    },
    path: testPath,
  });

  it('should use a custom path', () => request(rpcServer.server)
    .post(testPath)
    .set('Accept', 'application/json')
    .set('Content-Type', 'application/json')
    .send('{"jsonrpc":"2.0","id":8,"method":"sum","params":[2,4,6]}')
    .expect(200)
    .expect('Content-Type', 'application/json')
    .then((response) => {
      assert.strictEqual(response.body.jsonrpc, '2.0');
      assert.strictEqual(response.body.error, undefined);
      assert.strictEqual(response.body.id, 8);
      assert.strictEqual(response.body.result, 12);
    }));
});

describe('onRequest & onError callbacks', () => {
  const reqStr = '{"jsonrpc":"2.0","id":9,"method":"sum","params":[1,2,3]}';
  let lastReqStr;
  let lastErrId;
  const onRequest = (req) => {
    lastReqStr = JSON.stringify(req);
  };
  const onError = (err, id) => {
    lastErrId = id;
  };
  const rpcServer = new RpcServer({
    methods: {
      sum,
    },
    onRequest,
    onError,
  });

  it('should trigger the onRequest callback', () => request(rpcServer.server)
    .post('/')
    .set('Accept', 'application/json')
    .set('Content-Type', 'application/json')
    .send(reqStr)
    .expect(200)
    .expect('Content-Type', 'application/json')
    .then((response) => {
      assert.strictEqual(reqStr, lastReqStr);
      assert.strictEqual(response.body.jsonrpc, '2.0');
      assert.strictEqual(response.body.error, undefined);
      assert.strictEqual(response.body.id, 9);
      assert.strictEqual(response.body.result, 6);
    }));

  it('should trigger the onError callback', () => request(rpcServer.server)
    .post('/')
    .set('Accept', 'application/json')
    .set('Content-Type', 'application/json')
    .send('{"jsonrpc":"2.0","id":10,"method":"sum","params":["a","b","c"]}')
    .expect(200)
    .expect('Content-Type', 'application/json')
    .then((response) => {
      assert.strictEqual(lastErrId, 10);
      assert.strictEqual(response.body.jsonrpc, '2.0');
      assert.strictEqual(response.body.result, undefined);
      assert.strictEqual(response.body.error.code, RpcServer.SERVER_ERROR);
      assert.strictEqual(response.body.id, 10);
    }));
});


describe('setMethod', () => {
  const rpcServer = new RpcServer();

  it('should set and call a method', () => {
    rpcServer.setMethod('sum', sum);
    request(rpcServer.server)
      .post('/')
      .set('Accept', 'application/json')
      .set('Content-Type', 'application/json')
      .send('{"jsonrpc":"2.0","id":11,"method":"sum","params":[3,6,9]}')
      .expect(200)
      .expect('Content-Type', 'application/json')
      .then((response) => {
        assert.strictEqual(response.body.jsonrpc, '2.0');
        assert.strictEqual(response.body.error, undefined);
        assert.strictEqual(response.body.id, 11);
        assert.strictEqual(response.body.result, 18);
      });
  });
});

async function listenOnOpenPort(rpcServer) {
  // find an available port
  let port = 1024;
  while (port < 65536) {
    try {
      await rpcServer.listen(port);
      return port;
    } finally {
      port += 1;
    }
  }
  throw new Error('could not find open port');
}

describe('listening and closing', () => {
  let rpcServer;

  beforeEach(() => {
    rpcServer = new RpcServer();
  });

  it('should listen on an open port then stop listening', async () => {
    await listenOnOpenPort(rpcServer);
    assert.ok(rpcServer.server.listening);
    await rpcServer.close();
    assert.ok(!rpcServer.server.listening);
  });
});
