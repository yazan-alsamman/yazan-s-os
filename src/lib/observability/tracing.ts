import { SpanStatusCode, trace, type Span } from "@opentelemetry/api";

/**
 * Provider-neutral tracing (ADR 0008). Code depends only on @opentelemetry/api; until an
 * SDK/exporter is registered in src/instrumentation.ts these spans are no-ops.
 */
const tracer = trace.getTracer("peos");

export async function withSpan<T>(name: string, fn: (span: Span) => Promise<T>): Promise<T> {
  return tracer.startActiveSpan(name, async (span) => {
    try {
      return await fn(span);
    } catch (error) {
      span.setStatus({ code: SpanStatusCode.ERROR });
      if (error instanceof Error) span.recordException(error);
      throw error;
    } finally {
      span.end();
    }
  });
}
