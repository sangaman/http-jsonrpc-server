/* eslint-env mocha */

const assert = require('assert');
const request = require('supertest');
const RpcServer = require('../lib/http-jsonrpc-server');

const rpcServer = new RpcServer();
const server = rpcServer.getServer();

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

describe('jsonrpc-server', () => {
  before(async () => {
    rpcServer.setMethod('sum', sum);
    rpcServer.setMethod('wait', wait);
  });

  it('should 404 an unknown path', () => request(server)
    .post('/invalidpath')
    .expect(404));

  it('should 405 GET requests', () => request(server)
    .get('/')
    .expect(405));

  it('should 415 non application/json requests', () => request(server)
    .post('/')
    .expect(415));

  it('should error invalid json', () => request(server)
    .post('/')
    .set('Accept', 'application/json')
    .set('Content-Type', 'application/json')
    .send('asdlkfjasld')
    .expect(200)
    .expect('Content-Type', /json/)
    .then((response) => {
      assert.strictEqual(response.body.jsonrpc, '2.0');
      assert.strictEqual(response.body.result, undefined);
      assert.strictEqual(response.body.error.code, RpcServer.PARSE_ERROR);
    }));

  it('should error invalid jsonrpc', () => request(server)
    .post('/')
    .set('Accept', 'application/json')
    .set('Content-Type', 'application/json')
    .send('{"jsonrpc":"1.0","id":1,"method":"sum"}')
    .expect(200)
    .then((response) => {
      assert.strictEqual(response.body.jsonrpc, '2.0');
      assert.strictEqual(response.body.result, undefined);
      assert.strictEqual(response.body.id, 1);
      assert.strictEqual(response.body.error.code, RpcServer.INVALID_REQUEST);
    }));

  it('should error invalid id', () => request(server)
    .post('/')
    .set('Accept', 'application/json')
    .set('Content-Type', 'application/json')
    .send('{"jsonrpc":"2.0","id":["ids should not be arrays"],"method":"sum"}')
    .expect(200)
    .then((response) => {
      assert.strictEqual(response.body.jsonrpc, '2.0');
      assert.strictEqual(response.body.result, undefined);
      assert.strictEqual(response.body.error.code, RpcServer.INVALID_REQUEST);
    }));

  it('should error invalid method', () => request(server)
    .post('/')
    .set('Accept', 'application/json')
    .set('Content-Type', 'application/json')
    .send('{"jsonrpc":"2.0","id":1,"method":123}')
    .expect(200)
    .then((response) => {
      assert.strictEqual(response.body.jsonrpc, '2.0');
      assert.strictEqual(response.body.result, undefined);
      assert.strictEqual(response.body.id, 1);
      assert.strictEqual(response.body.error.code, RpcServer.METHOD_NOT_FOUND);
    }));

  it('should error invalid params', () => request(server)
    .post('/')
    .set('Accept', 'application/json')
    .set('Content-Type', 'application/json')
    .send('{"jsonrpc":"2.0","id":1,"method":"sum","params":"params should not be a string"}')
    .expect(200)
    .then((response) => {
      assert.strictEqual(response.body.jsonrpc, '2.0');
      assert.strictEqual(response.body.result, undefined);
      assert.strictEqual(response.body.id, 1);
      assert.strictEqual(response.body.error.code, RpcServer.INVALID_PARAMS);
    }));

  it('should return expected result for valid request', () => request(server)
    .post('/')
    .set('Accept', 'application/json')
    .set('Content-Type', 'application/json')
    .send('{"jsonrpc":"2.0","id":1,"method":"sum","params":[1,2,3]}')
    .expect(200)
    .then((response) => {
      assert.strictEqual(response.body.jsonrpc, '2.0');
      assert.strictEqual(response.body.error, undefined);
      assert.strictEqual(response.body.id, 1);
      assert.strictEqual(response.body.result, 6);
    }));

  it('should return nothing for notifications', () => request(server)
    .post('/')
    .set('Accept', 'application/json')
    .set('Content-Type', 'application/json')
    .send('{"jsonrpc":"2.0","method":"sum","params":[1,2,3]}')
    .expect(204)
    .then((response) => {
      assert.strictEqual(response.body, '');
    }));

  it('should return batched results for valid requests', () => request(server)
    .post('/')
    .set('Accept', 'application/json')
    .set('Content-Type', 'application/json')
    .send('[{"jsonrpc":"2.0","id":1,"method":"sum","params":[1,2,3]},{"jsonrpc":"2.0","id":2,"method":"sum","params":[4,5,6]}]')
    .expect(200)
    .then((response) => {
      assert.ok(Array.isArray(response.body));
      assert.strictEqual(response.body.length, 2);
      for (let n = 0; n < response.body.length; n += 1) {
        assert.strictEqual(response.body[n].jsonrpc, '2.0');
        assert.strictEqual(response.body[n].error, undefined);
        if (response.body[n].id === 1) {
          assert.strictEqual(response.body[n].result, 6);
        } else if (response.body[n].id === 2) {
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

  it('should call an async method', () => request(server)
    .post('/')
    .set('Accept', 'application/json')
    .set('Content-Type', 'application/json')
    .send('{"jsonrpc":"2.0","id":1,"method":"wait","params":{"ms":50}}')
    .expect(200)
    .then((response) => {
      assert.strictEqual(response.body.jsonrpc, '2.0');
      assert.strictEqual(response.body.error, undefined);
      assert.strictEqual(response.body.id, 1);
      assert.ok(response.body.result);
    }));
});
