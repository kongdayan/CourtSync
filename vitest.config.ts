import {
  cloudflareTest,
  readD1Migrations,
} from "@cloudflare/vitest-pool-workers";
import { defineConfig } from "vitest/config";

export default defineConfig(async () => {
  const migrations = await readD1Migrations("d1/migrations");

  return {
    plugins: [
      cloudflareTest({
        wrangler: { configPath: "./wrangler.jsonc" },
        miniflare: {
          bindings: {
            APP_BASE_URL: "http://localhost",
            DEFAULT_RULE_LIMIT: 2,
            ADMIN_RULE_LIMIT: 20,
            ADMIN_EMAILS: "admin@example.test",
            BETTER_AUTH_SECRET: "test-better-auth-secret-at-least-32-chars",
            GOOGLE_CLIENT_ID: "test-google-client-id",
            GOOGLE_CLIENT_SECRET: "test-google-client-secret",
            CHANNEL_ENCRYPTION_KEYS: "test-channel-encryption-key",
            ADMIN_PUSHDEER_KEYS: "test-admin-pushdeer-key",
            TEST_MIGRATIONS: migrations,
          },
        },
      }),
    ],
    test: {
      include: ["test/worker/**/*.test.ts"],
      setupFiles: ["./test/setup-app-db.ts"],
      fileParallelism: false,
      passWithNoTests: true,
      sequence: { concurrent: false },
    },
  };
});
