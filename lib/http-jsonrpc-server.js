const http = require('http');
const assert = require('assert');
const reqhandler = require('./reqhandler');
const consts = require('./consts');

const callbackNames = ['onRequest', 'onRequestError', 'onResult', 'onServerError'];

/** Class representing a HTTP JSON-RPC server */
class RpcServer {
  /**
   * @param {Object} options - Optional parameters for the server
   * @param {Object} options.methods - A map of method names to functions. Method functions are
   * passed one parameter which will either be an Object or a string array
   * @param options.context - Context to be used as `this` for method functions.
   * @param {string} options.path - The path for the server
   * @param {function} options.onRequest - Callback for when requests are received, it is
   * passed an Object representing the request
   * @param {function} options.onRequestError - Callback for when requested methods throw errors,
   * it is passed an error and request id
   * @param {function} options.onResult - Callback for when requests are successfully returned a
   * result. It is passed the response object and request id
   * @param {function} options.onServerError - Callback for server errors, it is passed an
   * {@link https://nodejs.org/api/errors.html#errors_class_error Error}
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
      if (options.context) {
        for (let n = 0; n < keys.length; n += 1) {
          const key = keys[n];
          this.methods[key] = this.methods[key].bind(options.context);
        }
      }
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
   * Sets a method.
   * @param {string} name - The name of the method
   * @param {function} method - The function to be called for this method. Method functions are
   * passed one parameter which will either be an Object or a string array.
   */
  setMethod(name, method) {
    assert(typeof method === 'function', 'method is not a function');
    this.methods[name] = method;
  }

  /**
   * Begins listening on a given port and host.
   * @param {number} port - The port number to listen on - an arbitrary available port is used if
   * no port is specified
   * @param {string} host - The host name or ip address to listen on - the unspecified IP address
   * (`0.0.0.0` or `(::)`) is used if no host is specified
   * @returns {Promise<number>} A promise that resolves to the assigned port once the server is
   * listening. On error the promise will be rejected with an {@link https://nodejs.org/api/errors.html#errors_class_error Error}.
   */
  listen(port, host) {
    return new Promise((resolve, reject) => {
      const errHandler = (err) => {
        reject(err);
      };

      this.server.listen(port, host, () => {
        resolve(this.server.address().port);
        this.server.removeListener('error', errHandler);
      }).once('error', errHandler);
    });
  }

  /**
   * Stops listening on all ports.
   * @returns {Promise<void>} A promise that resolves once the server stops listening. On error the
   * promise will be rejected with an {@link https://nodejs.org/api/errors.html#errors_class_error Error}.
   */
  close() {
    return new Promise((resolve, reject) => {
      this.server.close(() => {
        resolve();
        this.server.removeAllListeners();
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
