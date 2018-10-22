/* eslint-env mocha */
/* eslint no-await-in-loop: 0 */

const assert = require('assert');
const request = require('supertest');
const RpcServer = require('../lib/http-jsonrpc-server');
const consts = require('../lib/consts');

function sum(arr) {
  let total = 0;
  for (let n = 0; n < arr.length; n += 1) {
    assert(typeof arr[n] === 'number', 'parameters must be an array of numbers');
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

  it('should create an RpcServer object for valid options', () => {
    const onRequest = () => 'request';
    const onRequestError = () => 'request error';
    const onServerError = () => 'server error';
    const methods = {
      sum,
      wait,
    };
    rpcServer = new RpcServer({
      onRequest,
      onRequestError,
      onServerError,
      methods,
      path: testPath,
    });
    assert(rpcServer instanceof RpcServer);
    assert.strictEqual(rpcServer.onRequestError, onRequestError);
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

  it('should error onRequestError that is not a function', () => {
    assert.throws(() => new RpcServer({
      onRequestError: 'not a function',
    }));
  });

  it('should error onServerError that is not a function', () => {
    assert.throws(() => new RpcServer({
      onServerError: 'not a function',
    }));
  });
});

async function testRequest(options) {
  return request(options.server)
    .post(options.path || '/')
    .set('Accept', options.accept || 'application/json')
    .set('Content-Type', options.contentType || 'application/json')
    .send(options.body)
    .expect(200)
    .expect('Content-Type', 'application/json');
}

function assertError(body, expectedCode, id) {
  assert.strictEqual(body.jsonrpc, '2.0');
  assert.strictEqual(body.result, undefined);
  assert.strictEqual(body.error.code, expectedCode);
  if (id) {
    assert.strictEqual(body.id, id);
  }
}

function assertResult(body, expectedResult, id) {
  assert.strictEqual(body.jsonrpc, '2.0');
  assert.strictEqual(body.error, undefined);
  assert.strictEqual(body.id, id);
  assert.strictEqual(body.result, expectedResult);
}

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

  it('should 400 requests that do not accept application/json', () => request(rpcServer.server)
    .post('/')
    .set('Content-Type', 'application/json')
    .expect(400)
    .then((response) => {
      assert.strictEqual(response.body.error, consts.INVALID_ACCEPT_HEADER_MSG);
    }));

  it('should error invalid json', () => testRequest({ server: rpcServer.server, body: 'asdlkfjasld' })
    .then((response) => {
      assertError(response.body, RpcServer.PARSE_ERROR);
    }));

  it('should error invalid jsonrpc', () => testRequest({
    server: rpcServer.server,
    body: '{"jsonrpc":"1.0","id":1,"method":"sum"}',
  }).then((response) => {
    assertError(response.body, RpcServer.INVALID_REQUEST, 1);
  }));

  it('should error invalid id', () => testRequest({
    server: rpcServer.server,
    body: '{"jsonrpc":"2.0","id":["ids should not be arrays"],"method":"sum"}',
  }).then((response) => {
    assertError(response.body, RpcServer.INVALID_REQUEST);
  }));

  it('should error invalid method', () => testRequest({
    server: rpcServer.server,
    body: '{"jsonrpc":"2.0","id":2,"method":123}',
  }).then((response) => {
    assertError(response.body, RpcServer.METHOD_NOT_FOUND, 2);
  }));

  it('should error invalid params', () => testRequest({
    server: rpcServer.server,
    body: '{"jsonrpc":"2.0","id":3,"method":"sum","params":"params should not be a string"}',
  }).then((response) => {
    assertError(response.body, RpcServer.INVALID_PARAMS, 3);
  }));

  it('should error on invalid input', () => testRequest({
    server: rpcServer.server,
    body: '{"jsonrpc":"2.0","id":12,"method":"sum","params":["a","b","c"]}',
  }).then((response) => {
    assertError(response.body, RpcServer.SERVER_ERROR, 12);
  }));

  it('should return expected result for valid request', () => testRequest({
    server: rpcServer.server,
    body: '{"jsonrpc":"2.0","id":4,"method":"sum","params":[1,2,3]}',
  }).then((response) => {
    assertResult(response.body, 6, 4);
  }));

  it('should return expected result for valid request with charset in content type', () => testRequest({
    server: rpcServer.server,
    body: '{"jsonrpc":"2.0","id":14,"method":"sum","params":[10,20]}',
    contentType: 'application/json; charset=utf-8',
  }).then((response) => {
    assertResult(response.body, 30, 14);
  }));

  it('should return expected result for valid request with multiple accept types', () => testRequest({
    server: rpcServer.server,
    body: '{"jsonrpc":"2.0","id":15,"method":"sum","params":[2,4]}',
    accept: 'text/plain, application/json, application/xml;q=0.9',
  }).then((response) => {
    assertResult(response.body, 6, 15);
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

  it('should return batched results for valid requests', () => testRequest({
    server: rpcServer.server,
    body: '[{"jsonrpc":"2.0","id":5,"method":"sum","params":[1,2,3]},{"jsonrpc":"2.0","id":6,"method":"sum","params":[4,5,6]}]',
  }).then((response) => {
    assert(Array.isArray(response.body));
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

  it('should call an async method', () => testRequest({
    server: rpcServer.server,
    body: '{"jsonrpc":"2.0","id":7,"method":"wait","params":{"ms":50}}',
  }).then((response) => {
    assertResult(response.body, true, 7);
  }));
});

describe('custom path', () => {
  const rpcServer = new RpcServer({
    methods: {
      sum,
    },
    path: testPath,
  });

  it('should use a custom path', () => testRequest({
    server: rpcServer.server,
    body: '{"jsonrpc":"2.0","id":8,"method":"sum","params":[2,4,6]}',
    path: testPath,
  }).then((response) => {
    assertResult(response.body, 12, 8);
  }));
});

describe('request callbacks', () => {
  const reqStr = '{"jsonrpc":"2.0","id":9,"method":"sum","params":[1,2,3]}';
  let lastReqStr;
  let lastErrId;
  let lastResId;
  const onRequest = (req) => {
    lastReqStr = JSON.stringify(req);
  };
  const onRequestError = (err, id) => {
    lastErrId = id;
  };
  const onResult = (result, id) => {
    lastResId = id;
  };
  const rpcServer = new RpcServer({
    methods: {
      sum,
    },
    onRequest,
    onRequestError,
    onResult,
  });

  it('should trigger the onRequest callback', () => testRequest({ server: rpcServer.server, body: reqStr })
    .then((response) => {
      assert.strictEqual(reqStr, lastReqStr);
      assertResult(response.body, 6, 9);
    }));

  it('should trigger the onRequestError callback', () => testRequest({
    server: rpcServer.server,
    body: '{"jsonrpc":"2.0","id":10,"method":"sum","params":["a","b","c"]}',
  }).then((response) => {
    assert.strictEqual(lastErrId, 10);
    assertError(response.body, RpcServer.SERVER_ERROR, 10);
  }));

  it('should trigger the onResult callback', () => testRequest({
    server: rpcServer.server,
    body: '{"jsonrpc":"2.0","id":13,"method":"sum","params":[5,5,5]}',
  }).then((response) => {
    assert.strictEqual(lastResId, 13);
    assertResult(response.body, 15, 13);
  }));
});


describe('setMethod', () => {
  const rpcServer = new RpcServer();

  it('should set and call a method', () => {
    rpcServer.setMethod('sum', sum);
    testRequest({
      server: rpcServer.server,
      body: '{"jsonrpc":"2.0","id":11,"method":"sum","params":[3,6,9]}',
    }).then((response) => {
      assertResult(response.body, 18, 11);
    });
  });
});

describe('listening and closing', () => {
  let rpcServer;

  beforeEach(() => {
    rpcServer = new RpcServer();
  });

  it('should listen on an open port then stop listening', async () => {
    await rpcServer.listen();
    assert(rpcServer.server.listening);
    await rpcServer.close();
    assert(!rpcServer.server.listening);
  });

  it('should fail listening on an invalid port', async () => {
    try {
      await rpcServer.listen(66666);
      assert.fail();
    } catch (err) {
      assert(err instanceof RangeError);
    }
    assert(!rpcServer.server.listening);
  });
});
