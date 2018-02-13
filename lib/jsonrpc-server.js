const http = require('http');

const PARSE_ERROR = -32700;
const INVALID_REQUEST = -32600;
const METHOD_NOT_FOUND = -32601;
const INVALID_PARAMS = -32602;
const SERVER_ERROR = -32000;

const methods = {};
let path = '/';

exports.PARSE_ERROR = PARSE_ERROR;
exports.INVALID_REQUEST = INVALID_REQUEST;
exports.METHOD_NOT_FOUND = METHOD_NOT_FOUND;
exports.INVALID_PARAMS = INVALID_PARAMS;
exports.SERVER_ERROR = SERVER_ERROR;

function setMethod(name, method) {
  if (typeof method !== 'function') {
    const err = { message: 'method is not a function' };
    throw err;
  }
  methods[name] = method;
}

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

async function processRequest(request) {
  const response = {
    jsonrpc: '2.0',
  };
  return new Promise((resolve) => {
    if (request.id) {
      if (request.id !== null && typeof request.id !== 'number' && typeof request.id !== 'string') {
        response.error = {
          code: INVALID_REQUEST,
          message: 'Invalid id',
        };
        resolve(response);
        return;
      }
      response.id = request.id;
    }

    if (request.jsonrpc !== '2.0') {
      response.error = {
        code: INVALID_REQUEST,
        message: 'Invalid jsonrpc value',
      };
      resolve(response);
      return;
    }

    if (!request.id) {
      // if we have a valid jsonrpc value but no id, treat this as a notification and return nothing
      resolve();
      return;
    }

    if (!request.method || typeof request.method !== 'string' || request.method.startsWith('rpc.') || !(request.method in methods)) {
      response.error = {
        code: METHOD_NOT_FOUND,
      };
      resolve(response);
      return;
    }

    if (request.params && typeof request.params !== 'object') {
      response.error = {
        code: INVALID_PARAMS,
      };
      resolve(response);
      return;
    }

    let methodResult;
    try {
      methodResult = methods[request.method](request.params);
    } catch (err) {
      if (response.id) {
        response.error = {
          code: SERVER_ERROR,
          message: err,
        };
        resolve(response);
      } else {
        resolve();
      }
      return;
    }
    Promise.resolve(methodResult).then((result) => {
      response.result = result;
    }).catch((err) => {
      response.error = {
        code: SERVER_ERROR,
        message: err,
      };
    }).then(() => {
      if (response.id) {
        resolve(response);
      } else {
        resolve();
      }
    });
  });
}

const server = http.createServer((req, res) => {
  res.setHeader('Connection', 'close');
  if (req.url !== path) {
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
          requestPromises.push(processRequest(request[n]));
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
      processRequest(request).then((response) => {
        sendResponse(res, response);
      });
    }
  }).on('error', (err) => {
    console.error(err.stack);
  });
});

function listen(port, listenPath) {
  if (!port || typeof port !== 'number' || port < 1024 || port > 65535) {
    const error = { message: 'must provide a valid port number between 1024 and 65535' };
    throw error;
  }
  if (listenPath) {
    path = listenPath;
  }
  server.listen(port);
}

exports.listen = listen;
exports.server = server;
exports.setMethod = setMethod;
