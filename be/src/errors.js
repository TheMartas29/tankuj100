class AppError extends Error {
  constructor(message, { status = 500, code = 'server_error', field = null } = {}) {
    super(message);
    this.name = new.target.name;
    this.status = status;
    this.code = code;
    this.field = field;
  }
}

class ValidationError extends AppError {
  constructor(message, field = null) {
    super(message, { status: 400, code: 'validation_error', field });
  }
}

class NotFoundError extends AppError {
  constructor(message) {
    super(message, { status: 404, code: 'not_found' });
  }
}

class TooManyRequestsError extends AppError {
  constructor(message, code = 'too_many_requests') {
    super(message, { status: 429, code });
  }
}

class MissingStationError extends AppError {
  constructor() {
    // Schválně 404 s kódem `validation_error` a polem `station_id` – iOS aplikace
    // tenhle tvar odpovědi dekóduje. Sjednocení na `not_found` by ji rozbilo.
    super('Tuhle benzínku už v databázi nemáme. Zkuste aplikaci obnovit.', {
      status: 404,
      code: 'validation_error',
      field: 'station_id',
    });
  }
}

module.exports = { AppError, ValidationError, NotFoundError, TooManyRequestsError, MissingStationError };
