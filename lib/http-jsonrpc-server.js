const http = require('http');
const reqhandler = require('./reqhandler');
const consts = require('./consts');
const assert = require('assert');

const callbackNames = ['onRequest', 'onRequestError', 'onResult', 'onServerError'];

/** Class representing a HTTP JSON-RPC server */
class RpcServer {
  /**
   * Create an RpcServer
   * @param {Object} options - Optional parameters for the server.
   * @param {Object} options.methods - A map of method names to functions. Method functions are
   * passed one parameter which will either be an Object or a string array.
   * @param {string} options.path - The path for the server.
   * @param {function} options.onRequest - Callback for when requests are received, it is
   * passed an Object representing the request.
   * @param {function} options.onRequestError - Callback for when requested methods throw errors,
   * it is passed an error and request id.
   * @param {function} options.onResult - Callback for when requests are successfully returned a
   * result.
   * @param {function} options.onServerError - Callback for server errors, it is passed an
   * {@link https://nodejs.org/api/errors.html#errors_class_error Error}.
   */
  constructor(options) {
    this.methods = {};
    this.path = '/';
    this.onRequest = null;
    this.onRequestError = null;
    this.onResult = null;
    this.onServerError = null;
    if (options) {
      this.applyOptions(options);
    }

    this.server = http.createServer(reqhandler.bind(this));
    if (this.onServerError) {
      this.server.on('error', this.onServerError);
    }
  }

  applyOptions(options) {
    if (options.methods) {
      assert(typeof options.methods === 'object' && !Array.isArray(options.methods), 'methods must be an object');
      const keys = Object.keys(options.methods);
      for (let n = 0; n < keys.length; n += 1) {
        const key = keys[n];
        assert(typeof options.methods[key] === 'function', 'methods may only contain functions');
      }
      this.methods = options.methods;
    }
    if (options.path) {
      assert(typeof options.path === 'string', 'path must be a string');
      assert(options.path.startsWith('/'), 'path must start with a "/" slash');
      assert(/^[A-Za-z0-9\-./\]@$&()*+,;=`_:~?#!']+$/.test(options.path), 'path contains invalid characters');
      this.path = options.path;
    }
    callbackNames.forEach((callbackName) => {
      if (options[callbackName]) {
        assert(typeof options[callbackName] === 'function', `${callbackName} must be a function`);
        this[callbackName] = options[callbackName];
      }
    });
  }

  static get PARSE_ERROR() {
    return consts.PARSE_ERROR;
  }
  static get INVALID_REQUEST() {
    return consts.INVALID_REQUEST;
  }
  static get METHOD_NOT_FOUND() {
    return consts.METHOD_NOT_FOUND;
  }
  static get INVALID_PARAMS() {
    return consts.INVALID_PARAMS;
  }
  static get SERVER_ERROR() {
    return consts.SERVER_ERROR;
  }
  static get SERVER_ERROR_MAX() {
    return consts.SERVER_ERROR_MAX;
  }

  /**
   * Set a method
   * @param {string} name - The name of the method
   * @param {function} method - The function to be called for this method. Method functions are
   * passed one parameter which will either be an Object or a string array.
   */
  setMethod(name, method) {
    assert(typeof method === 'function', 'method is not a function');
    this.methods[name] = method;
  }

  /**
   * Begin listening on a given port and host
   * @param {number} port - The port number to listen on
   * @param {string} host - The host name or ip address to listen on
   * @returns {Promise} A promise that resolves to true once the server is listening. On error or
   * invalid port number the promise will be rejected with an {@link https://nodejs.org/api/errors.html#errors_class_error Error}.
   */
  async listen(port, host) {
    assert(port && Number.isInteger(port) && port > 1023 && port < 65536, 'must provide a valid port integer between 1024 and 65535');
    return new Promise((resolve, reject) => {
      this.server.listen(port, host, () => {
        resolve(true);
      }).once('error', (err) => {
        reject(err);
      });
    });
  }

  /**
   * Stop listening on all ports
   * @returns {Promise} A promise that resolves to true once the server stops listening. On error
   * the promise will be rejected with an {@link https://nodejs.org/api/errors.html#errors_class_error Error}.
   */
  close() {
    return new Promise((resolve, reject) => {
      this.server.close(() => {
        resolve(true);
      }).once('error', (err) => {
        reject(err);
      });
    });
  }

  async processRequest(request) {
    if (this.onRequest) {
      this.onRequest(request);
    }
    let response = {
      jsonrpc: '2.0',
    };

    if (request.id) {
      if (request.id !== null && typeof request.id !== 'number' && typeof request.id !== 'string') {
        response.error = {
          code: consts.INVALID_REQUEST,
          message: 'Invalid id',
        };
        return response;
      }
      response.id = request.id;
    }

    if (request.jsonrpc !== '2.0') {
      response.error = {
        code: consts.INVALID_REQUEST,
        message: 'Invalid jsonrpc value',
      };
    } else if (!request.id) {
      // if we have no id, treat this as a notification and return nothing
      response = undefined;
    } else if (!request.method || typeof request.method !== 'string' || request.method.startsWith('rpc.') || !(request.method in this.methods)) {
      response.error = {
        code: consts.METHOD_NOT_FOUND,
      };
    } else if (request.params && typeof request.params !== 'object') {
      response.error = {
        code: consts.INVALID_PARAMS,
      };
    } else {
      // we have passed all up front error checks, call the method
      try {
        response.result = await Promise.resolve(this.methods[request.method](request.params));
        if (!response.id) {
          response = undefined; // don't return a response if id is null
        }
      } catch (err) {
        if (this.onRequestError) {
          this.onRequestError(err, request.id);
        }
        const message = err.message || err;
        response.error = { message };
        if (err.code && err.code <= consts.SERVER_ERROR && err.code >= consts.SERVER_ERROR_MAX) {
          response.error.code = err.code;
        } else {
          response.error.code = consts.SERVER_ERROR;
        }
      }
    }

    if (this.onResult && response.result) {
      this.onResult(response.result, request.id);
    }
    return response;
  }
}

module.exports = RpcServer;
