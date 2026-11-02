/**
 * Tiny structured logger. Human lines on stderr, so stdout stays clean for data.
 * Every run gets a timestamped line so the report can quote when things happened.
 */

function stamp() {
  return new Date().toISOString();
}

function line(level, msg, extra) {
  const tail = extra ? " " + JSON.stringify(extra) : "";
  process.stderr.write(`[${stamp()}] ${level} ${msg}${tail}\n`);
}

module.exports = {
  info: (msg, extra) => line("INFO", msg, extra),
  warn: (msg, extra) => line("WARN", msg, extra),
  error: (msg, extra) => line("ERROR", msg, extra),
  step: (msg, extra) => line("STEP", msg, extra),
  stamp
};
