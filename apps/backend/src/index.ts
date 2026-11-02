import "./load-env";
import { serve } from "@hono/node-server";
import { buildApp } from "./app";
import { getEnv } from "./env";
import { logger } from "./lib/logger";
import { log } from "./lib/app-context";
import { runWorkerLoop } from "./worker/loop";

const env = getEnv();
const { app } = buildApp();

const server = serve({ fetch: app.fetch, port: env.PORT }, (info) => {
  logger.info({ port: info.port, url: `http://localhost:${info.port}` }, "PGRS backend listening");
});

// Run the outbox worker in the same process (one container instead of two).
// Set INLINE_WORKER=false to run the loop as a standalone service again.
if (process.env.INLINE_WORKER !== "false") {
  let stopping = false;
  runWorkerLoop(() => stopping).catch((err) => {
    log("worker").error({ err: String(err) }, "inline worker crashed; API keeps serving");
  });
  for (const signal of ["SIGINT", "SIGTERM"] as const) {
    process.on(signal, () => {
      stopping = true;
    });
  }
}

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    logger.info({ signal }, "shutting down");
    server.close(() => process.exit(0));
  });
}
