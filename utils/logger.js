const logMessages = [];

export function log(message) {
  const timestamp = new Date().toISOString().replace('T', ' ').substring(0, 19);
  const formattedMessage = `[${timestamp}] ${message}`;
  console.log(formattedMessage);
  logMessages.push(formattedMessage);
}

export function getLogMessages() {
  return [...logMessages];
}

export function getLastLogMessages(count = 50) {
  return logMessages.slice(-count);
}

export function clearLogs() {
  logMessages.length = 0;
}
