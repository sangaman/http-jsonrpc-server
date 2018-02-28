const http = require('http');
const reqhandler = require('./reqhandler');
const consts = require('./consts');

class RpcServer {
  constructor(options) {
    this.methods = {};
    this.path = '/';
    if (options) {
      if (options.methods) {
        if (typeof options.methods !== 'object' || Array.isArray(options.methods)) {
          throw new Error('methods must be an object');
        }
        const keys = Object.keys(options.methods);
        for (let n = 0; n < keys.length; n += 1) {
          const key = keys[n];
          if (typeof options.methods[key] !== 'function') {
            throw new Error('methods may only contain functions');
          }
        }
        this.methods = options.methods;
      }
      if (options.path) {
        if (typeof options.path !== 'string') {
          throw new Error('path must be a string');
        }
        if (!options.path.startsWith('/')) {
          throw new Error('path must start with a "/" slash');
        }
        if (!/^[A-Za-z0-9\-./\]@$&()*+,;=`_:~?#!']+$/.test(options.path)) {
          throw new Error('path contains invalid characters');
        }
        this.path = options.path;
      }
      if (options.onRequest) {
        if (typeof options.onRequest !== 'function') {
          throw new Error('onRequest must be a function');
        }
        this.onRequest = options.onRequest;
      }
      if (options.onError) {
        if (typeof options.onError !== 'function') {
          throw new Error('onError must be a function');
        }
        this.onError = options.onError;
      }
    }

    this.server = http.createServer(reqhandler.bind(this)).on('error', (err) => {
      console.error(err.stack);
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

  setMethod(name, method) {
    if (typeof method !== 'function') {
      throw new Error('method is not a function');
    }
    this.methods[name] = method;
  }

  listen(port) {
    return new Promise((resolve, reject) => {
      if (!port || typeof port !== 'number' || port < 1024 || port > 65535) {
        reject(new Error('must provide a valid port number between 1024 and 65535'));
      }
      this.server.listen(port, () => {
        resolve(true);
      }).once('error', (err) => {
        reject(err);
      });
    });
  }

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
        if (this.onError) {
          this.onError(err, request.id);
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

    return response;
  }
}

module.exports = RpcServer;
