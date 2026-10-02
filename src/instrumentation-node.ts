/**
 * Node.js startup:
 * 1. Validates the environment so misconfiguration fails at boot, not on first request.
 * 2. Registration point for the OpenTelemetry SDK — exporter deferred (ADR 0008).
 */
import { getServerEnv, InvalidEnvironmentError } from "@/lib/config/env";
import { logger } from "@/lib/observability/logger";

try {
  getServerEnv();
} catch (error) {
  if (error instanceof InvalidEnvironmentError) {
    console.error(`\n[peos] ${error.message}\n\nSee .env.example for the required variables.\n`);
    process.exit(1);
  }
  throw error;
}

logger.info({ nodeEnv: process.env.NODE_ENV }, "app.started");
