const fs = require('fs');
const path = require('path');
const paths = require('./paths');

let stream = null;

function initStream() {
  if (stream) return stream;
  const date = new Date().toISOString().slice(0, 10);
  const file = path.join(paths.logsDir(), `omnidesk-${date}.log`);
  stream = fs.createWriteStream(file, { flags: 'a' });
  return stream;
}

function write(level, args) {
  const ts = new Date().toISOString();
  const line = `[${ts}] [${level}] ${args.map(a => (typeof a === 'string' ? a : JSON.stringify(a))).join(' ')}\n`;
  try { initStream().write(line); } catch (_) {}
  if (level === 'ERROR') console.error(line.trim());
  else console.log(line.trim());
}

module.exports = {
  info:  (...a) => write('INFO',  a),
  warn:  (...a) => write('WARN',  a),
  error: (...a) => write('ERROR', a),
  debug: (...a) => write('DEBUG', a)
};
