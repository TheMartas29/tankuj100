const { AppError } = require('../errors');

const SERVER_ERROR_MESSAGE = 'Na serveru se něco pokazilo. Zkuste to prosím za chvíli.';

const errorBody = ({ code, message, field }) => ({
  error: code,
  message,
  ...(field ? { field } : {}),
});

function apiNotFound(req, res) {
  res.status(404).json(errorBody({ code: 'not_found', message: 'Tenhle endpoint neexistuje.' }));
}

function errorHandler(err, req, res, next) { // eslint-disable-line no-unused-vars
  if (err instanceof SyntaxError && 'body' in err) {
    return res.status(400).json(errorBody({ code: 'bad_json', message: 'Data se nepodařilo přečíst.' }));
  }

  const status = err.status || err.statusCode || 500;
  const isKnown = err instanceof AppError && status < 500;
  if (status >= 500) console.error('[error]', err);

  res.status(status).json(
    errorBody({
      code: isKnown ? err.code : 'server_error',
      message: status >= 500 ? SERVER_ERROR_MESSAGE : err.message,
      field: isKnown ? err.field : null,
    })
  );
}

module.exports = { apiNotFound, errorHandler };
