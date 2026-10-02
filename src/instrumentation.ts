/**
 * Next.js server startup hook. Node-only work lives in instrumentation-node.ts so the
 * Edge bundle never references Node APIs.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./instrumentation-node");
  }
}
