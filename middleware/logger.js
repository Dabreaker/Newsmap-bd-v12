'use strict';
const fs   = require('fs');
const path = require('path');

const IS_VERCEL = !!process.env.VERCEL;
let LOG_FILE;
if (!IS_VERCEL) {
  const logsDir = path.join(__dirname, '..', 'logs');
  if (!fs.existsSync(logsDir)) try { fs.mkdirSync(logsDir, { recursive: true }); } catch {}
  LOG_FILE = path.join(logsDir, 'app.log');
}

function stamp() { return new Date().toISOString(); }

function write(line) {
  const out = `[${stamp()}] ${line}\n`;
  process.stdout.write(out);
  if (!IS_VERCEL && LOG_FILE) {
    try { fs.appendFileSync(LOG_FILE, out); } catch {}
  }
}

module.exports = {
  info:  (...a) => write('INFO  ' + a.join(' ')),
  warn:  (...a) => write('WARN  ' + a.join(' ')),
  error: (...a) => write('ERROR ' + a.join(' ')),
  middleware: (req, _res, next) => { write(`REQ   ${req.method} ${req.path}`); next(); },
};
