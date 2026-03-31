// ============================================================
// Next.js Instrumentation Hook
//
// This runs once when the Next.js server starts.
// We use it to start the background health check scheduler
// in production (or when ENABLE_SCHEDULER=true).
//
// Docs: https://nextjs.org/docs/app/building-your-application/optimizing/instrumentation
// ============================================================

export async function register() {
  // Only run on the server (not in Edge runtime or during build)
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const shouldStart =
      process.env.NODE_ENV === "production" ||
      process.env.ENABLE_SCHEDULER === "true";

    if (shouldStart) {
      const { startScheduler } = await import("@/lib/scheduler");
      startScheduler();
    } else {
      console.log(
        "[Instrumentation] Scheduler disabled in development. Set ENABLE_SCHEDULER=true to enable."
      );
    }
  }
}
