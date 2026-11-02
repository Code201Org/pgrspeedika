import { createAppContext, log } from "../lib/app-context";
import { getEnv } from "../env";
import type { AppContext } from "../lib/app-context";
import { processBatch } from "./processor";

const POLL_INTERVAL_MS = 2_000;

/**
 * The outbox polling loop. Runs standalone via worker/run.ts, or in-process
 * inside the API (see src/index.ts) so a single container serves both and the
 * worker service can be retired. Safe to run as the only instance — batches
 * claim rows with FOR UPDATE SKIP LOCKED.
 */
export async function runWorkerLoop(shouldStop: () => boolean = () => false): Promise<void> {
  const env = getEnv();
  const ctx: AppContext = createAppContext(env);
  log("worker").info({ pollMs: POLL_INTERVAL_MS }, "outbox worker started");

  while (!shouldStop()) {
    try {
      const processed = await processBatch(ctx);
      if (processed === 0) {
        await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
      }
    } catch (err) {
      log("worker").error({ err: String(err) }, "batch failed; retrying");
      await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
    }
  }
  log("worker").info("outbox worker stopped");
}
