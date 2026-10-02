import pino from "pino";

/**
 * Paths redacted from every log line: credentials, tokens, cookies and auth headers,
 * at the top level or one level deep in the logged object.
 */
export const REDACTED_PATHS = [
  "password",
  "*.password",
  "token",
  "*.token",
  "accessToken",
  "*.accessToken",
  "refreshToken",
  "*.refreshToken",
  "idToken",
  "*.idToken",
  "secret",
  "*.secret",
  "apiKey",
  "*.apiKey",
  "cookie",
  "*.cookie",
  "authorization",
  "*.authorization",
  "headers.cookie",
  "headers.authorization",
  'headers["set-cookie"]',
];

/** Build a structured JSON logger. Exported for tests; app code uses `logger`. */
export function createLogger(
  options: { level?: string; destination?: pino.DestinationStream } = {},
) {
  return pino(
    {
      level: options.level ?? process.env.LOG_LEVEL ?? "info",
      base: { service: process.env.OTEL_SERVICE_NAME ?? "peos" },
      timestamp: pino.stdTimeFunctions.isoTime,
      messageKey: "message",
      formatters: {
        level: (label) => ({ level: label }),
      },
      redact: { paths: REDACTED_PATHS, censor: "[REDACTED]" },
    },
    options.destination,
  );
}

export const logger = createLogger();

export type Logger = pino.Logger;
