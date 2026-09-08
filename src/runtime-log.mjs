const allowedNames = new Set(['Error', 'TypeError', 'RangeError', 'AssertionError', 'AbortError', 'TimeoutError', 'TokenInvalid', 'DisallowedIntents']);

export function safeErrorCode(error) {
  if (Number.isSafeInteger(error?.code)) return String(error.code);
  if (typeof error?.code === 'string' && /^[A-Z][A-Z0-9_]{0,39}$/.test(error.code)) return error.code;
  if (allowedNames.has(error?.code)) return error.code;
  return allowedNames.has(error?.name) ? error.name : 'unknown';
}

export function runtimeLog(event, fields = {}) {
  const record = { at: new Date().toISOString(), event };
  for (const key of ['code', 'attempt', 'delayMs', 'pid', 'ready']) {
    if (fields[key] !== undefined) record[key] = fields[key];
  }
  console.log(JSON.stringify(record));
}
