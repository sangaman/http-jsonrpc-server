const consts = require('./consts');

function sendResponse(res, response) {
  if (response) {
    const responseStr = JSON.stringify(response);
    res.setHeader('Content-Type', 'application/json');
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
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Length', formattedMessage.length);
    res.write(formattedMessage);
  }
  res.end();
}

function checkRequest(req, path) {
  let err;
  if (req.url !== path) {
    err = { statusCode: 404 };
  } else if (req.method !== 'POST') {
    err = { statusCode: 405 };
  } else if (!req.headers['content-type'] || (req.headers['content-type'] !== 'application/json'
    && !req.headers['content-type'].startsWith('application/json;'))) {
    err = { statusCode: 415 };
  } else if (!req.headers.accept || (req.headers.accept !== 'application/json'
    && !req.headers.accept.split(',').some((value) => {
      const trimmedValue = value.trim();
      return trimmedValue === 'application/json' || trimmedValue.startsWith('application/json;');
    }))) {
    err = { statusCode: 400, message: consts.INVALID_ACCEPT_HEADER_MSG };
  } else {
    const reqContentLength = parseInt(req.headers['content-length'], 10);
    if (Number.isNaN(reqContentLength) || reqContentLength < 0) {
      err = { statusCode: 400, message: consts.INVALID_CONTENT_LENGTH_MSG };
    }
  }
  return err;
}

function reqHandler(req, res) {
  res.setHeader('Connection', 'close');
  const reqErr = checkRequest(req, this.path);
  if (reqErr) {
    sendError(res, reqErr.statusCode, reqErr.message);
    return;
  }

  const body = [];
  req.on('data', (chunk) => {
    body.push(chunk);
  }).on('end', () => {
    const bodyStr = Buffer.concat(body).toString();
    const reqContentLength = parseInt(req.headers['content-length'], 10);

    if (bodyStr.length !== reqContentLength) {
      sendError(res, 400, consts.INVALID_CONTENT_LENGTH_MSG);
      return;
    }

    res.setHeader('Content-Type', 'application/json');

    let request;
    try {
      request = JSON.parse(bodyStr);
    } catch (err) {
      const response = {
        id: null,
        jsonrpc: '2.0',
        error: {
          code: consts.PARSE_ERROR,
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

module.exports = reqHandler;
