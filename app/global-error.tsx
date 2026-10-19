"use client";

/**
 * Last-resort boundary for errors in the root layout itself, so it can't
 * rely on the app's providers or styles — hence the inline styling.
 */
export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en">
      <body style={{ margin: 0, minHeight: "100vh", display: "grid", placeItems: "center", background: "#0a0a0f", color: "#f4f4f5", fontFamily: "system-ui, sans-serif" }}>
        <div style={{ textAlign: "center", padding: 24 }}>
          <h1 style={{ fontSize: 20 }}>KomaMotion is having trouble</h1>
          <p style={{ color: "#a1a1aa", fontSize: 14 }}>Please try again in a moment.</p>
          <button onClick={reset} style={{ marginTop: 12, padding: "8px 16px", borderRadius: 8, border: "1px solid #3f3f46", background: "#18181b", color: "#f4f4f5" }}>
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
