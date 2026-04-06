// ============================================================
// Next.js Instrumentation Hook
//
// This runs once when the Next.js server starts.
// We use it to start the background health check scheduler
// when CHECK_RUNNER_MODE=scheduler (default) or ENABLE_SCHEDULER=true.
//
// Docs: https://nextjs.org/docs/app/building-your-application/optimizing/instrumentation
// ============================================================

export async function register() {
  // Only run on the server (not in Edge runtime or during build)
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const runnerMode = (process.env.CHECK_RUNNER_MODE || "scheduler").toLowerCase();
    const shouldStart =
      process.env.ENABLE_SCHEDULER === "true" ||
      (process.env.NODE_ENV === "production" && runnerMode !== "cron");

    if (shouldStart) {
      const { startScheduler } = await import("@/lib/scheduler");
      startScheduler();
    } else {
      console.log(
        "[Instrumentation] Scheduler disabled. Set CHECK_RUNNER_MODE=scheduler or ENABLE_SCHEDULER=true to enable."
      );
    }
  }
}
