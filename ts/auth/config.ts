import { betterAuth } from "better-auth";
import { withCloudflare } from "better-auth-cloudflare";

export function createAuth(env: Env) {
  const cloudflareCfg = withCloudflare(
    {
      d1Native: env.APP_DB,
      autoDetectIpAddress: false,
      geolocationTracking: false,
    },
    {
      database: env.APP_DB,
    },
  );

  return betterAuth({
    appName: "CourtSync",
    baseURL: `${env.APP_BASE_URL}/api/auth`,
    secret: env.BETTER_AUTH_SECRET,
    database: cloudflareCfg.database,
    socialProviders: {
      google: {
        clientId: env.GOOGLE_CLIENT_ID,
        clientSecret: env.GOOGLE_CLIENT_SECRET,
        prompt: "select_account",
      } as never,
    },
    session: {
      expiresIn: 60 * 60 * 24 * 30,
      updateAge: 60 * 60 * 24,
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
