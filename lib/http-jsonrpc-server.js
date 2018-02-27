const http = require('http');

const PARSE_ERROR = -32700;
const INVALID_REQUEST = -32600;
const METHOD_NOT_FOUND = -32601;
const INVALID_PARAMS = -32602;
const SERVER_ERROR = -32000;
const SERVER_ERROR_MAX = -32099;

function sendResponse(res, response) {
  if (response) {
    const responseStr = JSON.stringify(response);
    res.setHeader('Content-Length', responseStr.length);
    res.write(responseStr);
  } else {
    // Respond 204 for notifications with no response
    res.setHeader('Content-Length', 0);
    res.statusCode = 204;
  }
  res.end();
}

function sendError(res, statusCode, message) {
  res.statusCode = statusCode;
  if (message) {
    const formattedMessage = `{"error":"${message}"}`;
    res.setHeader('Content-Length', formattedMessage.length);
    res.write(formattedMessage);
  }
  res.end();
}

function requestListener(req, res) {
  res.setHeader('Connection', 'close');
  if (req.url !== this.path) {
    sendError(res, 404);
    return;
  }
  if (req.method !== 'POST') {
    sendError(res, 405);
    return;
  }
  if (req.headers['content-type'] !== 'application/json') {
    sendError(res, 415);
    return;
  }

  res.setHeader('Content-Type', 'application/json');
  if (req.headers.accept !== 'application/json') {
    sendError(res, 400, 'Accept header must be application/json');
    return;
  }
  if (!('content-length' in req.headers)) {
    sendError(res, 400, 'Missing Content-Length header');
    return;
  }
  const reqContentLength = parseInt(req.headers['content-length'], 10);
  if (Number.isNaN(reqContentLength) || reqContentLength < 0) {
    sendError(res, 400, 'Invalid Content-Length header');
    return;
  }

  const body = [];
  req.on('data', (chunk) => {
    body.push(chunk);
  }).on('end', () => {
    const bodyStr = Buffer.concat(body).toString();

    res.on('error', (err) => {
      console.error(err);
    });

    res.setHeader('Content-Type', 'application/json');

    let request;
    try {
      request = JSON.parse(bodyStr);
    } catch (err) {
      const response = {
        id: null,
        jsonrpc: '2.0',
        error: {
          code: PARSE_ERROR,
          message: err.message,
        },
      };
      sendResponse(res, response);
      return;
    }

    if (Array.isArray(request)) {
      if (request.length === 0) {
        sendResponse(res);
      } else {
        const requestPromises = [];
        for (let n = 0; n < request.length; n += 1) {
          requestPromises.push(this.processRequest(request[n]));
        }
        Promise.all(requestPromises).then((responses) => {
          // Remove undefined values from responses array.
          // These represent notifications that don't require responses.
          let prunedResponses = [];
          for (let n = 0; n < responses.length; n += 1) {
            if (responses[n]) {
              prunedResponses.push(responses[n]);
            }
          }
          if (prunedResponses.length === 0) {
            // If all the requests were notifications, there should be no response
            prunedResponses = undefined;
          }
          sendResponse(res, prunedResponses);
        });
      }
    } else {
      this.processRequest(request).then((response) => {
        sendResponse(res, response);
      });
    }
  });
}

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

    this.server = http.createServer(requestListener.bind(this)).on('error', (err) => {
      console.error(err.stack);
    });
  }

  static get PARSE_ERROR() {
    return PARSE_ERROR;
  }
  static get INVALID_REQUEST() {
    return INVALID_REQUEST;
  }
  static get METHOD_NOT_FOUND() {
    return METHOD_NOT_FOUND;
  }
  static get INVALID_PARAMS() {
    return INVALID_PARAMS;
  }
  static get SERVER_ERROR() {
    return SERVER_ERROR;
  }
  static get SERVER_ERROR_MAX() {
    return SERVER_ERROR_MAX;
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
    const response = {
      jsonrpc: '2.0',
    };

    if (request.id) {
      if (request.id !== null && typeof request.id !== 'number' && typeof request.id !== 'string') {
        response.error = {
          code: INVALID_REQUEST,
          message: 'Invalid id',
        };
        return response;
      }
      response.id = request.id;
    }

    if (request.jsonrpc !== '2.0') {
      response.error = {
        code: INVALID_REQUEST,
        message: 'Invalid jsonrpc value',
      };
      return response;
    }

    if (!request.id) {
      // if we have no id, treat this as a notification and return nothing
      return false;
    }

    if (!request.method || typeof request.method !== 'string' || request.method.startsWith('rpc.') || !(request.method in this.methods)) {
      response.error = {
        code: METHOD_NOT_FOUND,
      };
      return response;
    }

    if (request.params && typeof request.params !== 'object') {
      response.error = {
        code: INVALID_PARAMS,
      };
      return response;
    }

    try {
      response.result = await Promise.resolve(this.methods[request.method](request.params));
      if (response.id) {
        return response;
      }
      return false;
    } catch (err) {
      if (this.onError) {
        this.onError(err, request.id);
      }
      const message = err.message || err;
      response.error = { message };
      if (err.code && err.code <= SERVER_ERROR && err.code >= SERVER_ERROR_MAX) {
        response.error.code = err.code;
      } else {
        response.error.code = SERVER_ERROR;
      }
      return response;
    }
  }
}

module.exports = RpcServer;
