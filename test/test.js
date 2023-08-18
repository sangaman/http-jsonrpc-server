const { beforeEach, describe, it } = require('node:test');
const assert = require('assert');
const request = require('supertest');
const RpcServer = require('../lib/http-jsonrpc-server');
const consts = require('../lib/consts');

const realm = 'testrealm';

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

function getContext() {
  return this;
}

let notifiedMessage;
function notify(params) {
  notifiedMessage = params.message;
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

function testRequest(options) {
  const req = request(options.server)
    .post(options.path || '/')
    .set('Accept', options.accept || 'application/json')
    .set('Content-Type', options.contentType || 'application/json');

  if (options.authorization) {
    req.set('Authorization', options.authorization);
  }

  const ret = req.send(options.body)
    .expect(options.statusCode || 200);

  return (options.statusCode && options.statusCode === 401)
    ? ret.expect('WWW-Authenticate', `Basic realm="${realm}"`)
    : ret.expect('Content-Type', 'application/json');
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
      getContext,
      notify,
    },
    context: 'test context',
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

  it('should error invalid id array', () => testRequest({
    server: rpcServer.server,
    body: '{"jsonrpc":"2.0","id":["ids should not be arrays"],"method":"sum"}',
  }).then((response) => {
    assertError(response.body, RpcServer.INVALID_REQUEST, null);
  }));

  it('should error invalid id object', () => testRequest({
    server: rpcServer.server,
    body: '{"jsonrpc":"2.0","id":{"msg":"ids should not be objects"},"method":"sum"}',
  }).then((response) => {
    assertError(response.body, RpcServer.INVALID_REQUEST, null);
  }));

  it('should error invalid id boolean', () => testRequest({
    server: rpcServer.server,
    body: '{"jsonrpc":"2.0","id":false,"method":"sum"}',
  }).then((response) => {
    assertError(response.body, RpcServer.INVALID_REQUEST, null);
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

  it('should return expected result for valid request with a string id', () => testRequest({
    server: rpcServer.server,
    body: '{"jsonrpc":"2.0","id":"test","method":"sum","params":[1,2,3]}',
  }).then((response) => {
    assertResult(response.body, 6, 'test');
  }));

  it('should return expected result for valid request with a zero id', () => testRequest({
    server: rpcServer.server,
    body: '{"jsonrpc":"2.0","id":0,"method":"sum","params":[1,2,3]}',
  }).then((response) => {
    assertResult(response.body, 6, 0);
  }));

  it('should return expected result for valid request with a null id', () => testRequest({
    server: rpcServer.server,
    body: '{"jsonrpc":"2.0","id":null,"method":"sum","params":[1,2,3]}',
  }).then((response) => {
    assertResult(response.body, 6, null);
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
    .send('{"jsonrpc":"2.0","method":"notify","params":{"message":"test notification"}}')
    .expect(204)
    .expect('Content-Length', '0')
    .then((response) => {
      assert.strictEqual(response.body, '');
      // test to make sure the server handled the notification message
      assert.strictEqual(notifiedMessage, 'test notification');
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
    body: '{"jsonrpc":"2.0","id":7,"method":"wait","params":{"ms":1}}',
  }).then((response) => {
    assertResult(response.body, true, 7);
  }));

  it('should use optional context as this', () => testRequest({
    server: rpcServer.server,
    body: '{"jsonrpc":"2.0","id":16,"method":"getContext"}',
  }).then((response) => {
    assertResult(response.body, 'test context', 16);
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
    methods: { sum },
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

  it('should not leave listeners on closed servers', async () => {
    // treat erroring to console as a failure
    // this will fail on the "(node:7268) MaxListenersExceededWarning" warning if it is logged
    // eslint-disable-next-line no-console
    console.error = assert.fail;

    for (let n = 0; n < 11; n += 1) {
      /* eslint-disable-next-line no-await-in-loop */
      await rpcServer.listen();
      /* eslint-disable-next-line no-await-in-loop */
      await rpcServer.close();
    }
  });
});

function getAuthorization(username, password) {
  const authorization = Buffer.from(`${username}:${password}`).toString('base64');
  return `Basic ${authorization}`;
}

describe('authentication', () => {
  const reqStr = '{"jsonrpc":"2.0","id":17,"method":"sum","params":[1,2,3]}';
  const username = 'test';
  const password = 'wasspord';
  const rpcServer = new RpcServer({
    username,
    password,
    realm,
    methods: { sum },
  });

  it('should reject a request without authorization', () => testRequest({
    server: rpcServer.server,
    body: reqStr,
    statusCode: 401,
  }));

  it('should reject a request with invalid credentials', () => testRequest({
    server: rpcServer.server,
    body: reqStr,
    statusCode: 401,
    authorization: getAuthorization('wrong', 'credentials'),
  }));

  it('should accept a request with proper credentials', () => testRequest({
    server: rpcServer.server,
    body: reqStr,
    authorization: getAuthorization(username, password),
  }).then((response) => {
    assertResult(response.body, 6, 17);
  }));
});
