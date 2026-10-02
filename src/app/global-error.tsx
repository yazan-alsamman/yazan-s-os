"use client";

/** Last-resort boundary when the root layout itself fails. Must render its own <html>. */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body style={{ fontFamily: "system-ui, sans-serif", padding: "2rem" }}>
        <main role="alert">
          <h1>PEOS could not load</h1>
          <p>An unexpected error occurred. Try again, or check the server logs.</p>
          {error.digest && <p>Reference: {error.digest}</p>}
          <button type="button" onClick={reset}>
            Try again
          </button>
        </main>
      </body>
    </html>
  );
}
