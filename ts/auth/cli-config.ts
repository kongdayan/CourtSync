import { betterAuth } from "better-auth";

// CLI-only auth configuration for generating D1 migration SQL.
// This config is NOT used at runtime -- ts/auth/config.ts will be the
// real configuration.  It exists solely so that `npx @better-auth/cli
// generate` can introspect the plugin set and produce the core tables
// (user, session, account, verification) without email/password login.
//
// The database value is a placeholder: the CLI only needs it to
// determine the SQL dialect (SQLite for D1).  No real connection is
// established.
//
// Review generated SQL before committing: reject any migration that
// enables email/password login or stores plaintext secrets.
export const auth = betterAuth({
  database: {
    provider: "sqlite",
    url: ":memory:",
  } as never,
  socialProviders: {
    google: {
      clientId: "cli-placeholder",
      clientSecret: "cli-placeholder",
    },
  },
  session: {
    expiresIn: 60 * 60 * 24 * 30, // 30 days
  },
  account: {
    storeStateStrategy: "database",
  },
});
