import { betterAuth } from "better-auth";

export function createAuth(env: Env) {
  return betterAuth({
    appName: "CourtSync",
    baseURL: env.APP_BASE_URL,
    secret: env.BETTER_AUTH_SECRET,
    database: env.APP_DB,
    socialProviders: {
      google: {
        clientId: env.GOOGLE_CLIENT_ID,
        clientSecret: env.GOOGLE_CLIENT_SECRET,
        prompt: "select_account",
      } as never,
    },
    session: {
      expiresIn: 60 * 60 * 24 * 30, // 30 days
      updateAge: 60 * 60 * 24, // 1 day
      cookieCache: { enabled: false },
    },
    account: {
      encryptOAuthTokens: true,
      storeStateStrategy: "database",
    },
    advanced: {
      useSecureCookies: env.APP_BASE_URL.startsWith("https://"),
      cookiePrefix: "courtsync",
    },
  });
}

export type CourtSyncAuth = ReturnType<typeof createAuth>;
