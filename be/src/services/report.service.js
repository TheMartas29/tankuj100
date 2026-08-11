const reportRepo = require('../repositories/report.repo');
const { NotFoundError, TooManyRequestsError } = require('../errors');
const { notifyNewReport } = require('../mailer');
const { parseAdminNote } = require('../validation/inputs');

const MAX_PER_STATION_PER_DAY = 3;

function submit({ station, input }) {
  const stationId = station.id;

  // Nahlášení nevhodného komentáře z denního limitu vyjímáme – u jedné benzínky může
  // být problematických komentářů víc a moderaci nechceme uživateli blokovat.
  const limited = input.type !== 'content';
  if (limited && reportRepo.countRecentForDevice(stationId, input.deviceId) >= MAX_PER_STATION_PER_DAY) {
    throw new TooManyRequestsError(
      'Tuhle benzínku jste dnes už nahlásili. Díky, koukneme na to.',
      'too_many_reports'
    );
  }

  const report = reportRepo.create({ stationId, ...input });
  notifyNewReport({ report, station }).catch(() => {});
  return report;
}

const countOpenForStation = (stationId) => reportRepo.countOpenForStation(stationId);

const listForAdmin = (status) => reportRepo.listForAdmin({ status });

function setStatus(id, status, rawAdminNote) {
  const adminNote = parseAdminNote(rawAdminNote);
  if (reportRepo.setStatus(id, status, adminNote).changes === 0) {
    throw new NotFoundError('Hlášení nenalezeno.');
  }
}

function remove(id) {
  if (reportRepo.remove(id).changes === 0) {
    throw new NotFoundError('Hlášení nenalezeno.');
  }
}

module.exports = { submit, countOpenForStation, listForAdmin, setStatus, remove };
