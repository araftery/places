import { defineConfig } from "@trigger.dev/sdk";

export default defineConfig({
  project: "proj_mncozrjaaxijmtqttsqx",
  runtime: "node",
  logLevel: "debug",
  maxDuration: 3600,
  retries: {
    enabledInDev: false,
    default: {
      maxAttempts: 2,
      minTimeoutInMs: 1000,
      maxTimeoutInMs: 10000,
      factor: 2,
    },
  },
  dirs: ["./src/trigger"],
});
