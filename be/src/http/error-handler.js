const { AppError } = require('../errors');

const SERVER_ERROR_MESSAGE = 'Na serveru se něco pokazilo. Zkuste to prosím za chvíli.';
const CLIENT_ERROR_MESSAGE = 'Požadavek se nepodařilo zpracovat.';

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
  if (err.type === 'entity.too.large') {
    return res.status(413).json(
      errorBody({ code: 'payload_too_large', message: 'Odeslaná data jsou příliš velká.' })
    );
  }

  const status = err.status || err.statusCode || 500;
  // Jen chyby, které jsme vyrobili sami, mají text určený uživateli. Ostatní si
  // logujeme, ale ven neposíláme – bývá v nich cesta na disku nebo kus SQL.
  const isKnown = err instanceof AppError && status < 500;
  if (!isKnown) console.error('[error]', err);

  res.status(status).json(
    errorBody({
      code: isKnown ? err.code : status >= 500 ? 'server_error' : 'bad_request',
      message: isKnown ? err.message : status >= 500 ? SERVER_ERROR_MESSAGE : CLIENT_ERROR_MESSAGE,
      field: isKnown ? err.field : null,
    })
  );
}

module.exports = { apiNotFound, errorHandler };
