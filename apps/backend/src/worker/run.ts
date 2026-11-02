import "../load-env";
import { runWorkerLoop } from "./loop";
import { log } from "../lib/app-context";

/** Standalone worker entrypoint (own process: `pnpm dev:worker` or a container). */
let running = true;
for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    running = false;
  });
}

runWorkerLoop(() => !running)
  .then(() => process.exit(0))
  .catch((err) => {
    log("worker").error({ err: String(err) }, "worker crashed");
    process.exit(1);
  });
