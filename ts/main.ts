import { DataSourceKey } from "./types";

import { runTimeslotSync, AVAILABLE_SOURCES, USTHING_BEARER_KV_KEY } from "./sync/run";
import { runScheduledSync } from "./sync/orchestrator";
import { createApp } from "./http/app";
import { DeliveryService } from "./notifications/delivery-service";

const DEFAULT_DATA_SOURCE: DataSourceKey = "usthing";

function normalizeDataSource(value: string | null | undefined): DataSourceKey {
  const normalized = value?.trim().toLowerCase();
  if (normalized === "jiushi") {
    return "jiushi";
  }
  return DEFAULT_DATA_SOURCE;
}

function renderTokenAdminPage(params: {
  message?: string;
  error?: string;
}): Response {
  const { message, error } = params;
  const body = `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>USThing Bearer Manager</title>
    <style>
      body { font-family: ui-sans-serif, system-ui; margin: 0; padding: 2rem; background: #0f172a; color: #e2e8f0; }
      .card { max-width: 32rem; margin: 0 auto; background: #1e293b; padding: 2rem; border-radius: 1rem; box-shadow: 0 20px 45px rgba(15, 23, 42, 0.45); }
      h1 { font-size: 1.4rem; margin-bottom: 1rem; }
      label { display: block; margin-top: 1.2rem; font-weight: 600; color: #cbd5f5; }
      input, textarea { width: 100%; margin-top: 0.4rem; padding: 0.65rem 0.75rem; border-radius: 0.6rem; border: 1px solid rgba(148, 163, 184, 0.3); background: #0f172a; color: #e2e8f0; font-size: 0.95rem; }
      textarea { min-height: 10rem; resize: vertical; }
      button { margin-top: 1.5rem; width: 100%; padding: 0.75rem; border: none; border-radius: 0.75rem; font-size: 1rem; font-weight: 600; color: #0f172a; background: linear-gradient(135deg, #22d3ee, #0ea5e9); cursor: pointer; }
      button:hover { filter: brightness(1.05); }
      .hint { margin-top: 0.75rem; font-size: 0.85rem; color: #94a3b8; }
      .status { margin-top: 1rem; padding: 0.75rem 1rem; border-radius: 0.75rem; font-size: 0.9rem; }
      .status-success { background: rgba(20, 184, 166, 0.12); border: 1px solid rgba(16, 185, 129, 0.45); color: #5eead4; }
      .status-error { background: rgba(239, 68, 68, 0.17); border: 1px solid rgba(239, 68, 68, 0.5); color: #fecaca; }
    </style>
  </head>
  <body>
    <main class="card">
      <h1>Update USThing Bearer Token</h1>
      <p class="hint">Provide the admin secret and a full <code>Bearer ...</code> string. Submitting the form overwrites the existing entry in the <code>usthing:bearer</code> KV key.</p>
      ${
        message
          ? `<div class="status status-success">${message}</div>`
          : error
          ? `<div class="status status-error">${error}</div>`
          : ""
      }
      <form method="POST">
        <label for="secret">Admin Secret</label>
        <input id="secret" name="secret" type="password" autocomplete="current-password" required />

        <label for="token">USThing Bearer Token</label>
        <textarea id="token" name="token" placeholder="Bearer eyJ0eXAiOiJKV1QiLC..." required></textarea>

        <button type="submit">Save token</button>
      </form>
    </main>
  </body>
</html>`;

  return new Response(body, {
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}

async function handleTokenAdminRequest(
  request: Request,
  env: Env
): Promise<Response> {
  if (request.method === "GET") {
    return renderTokenAdminPage({});
  }

  if (request.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405 });
  }

  if (!env.TOKEN_ADMIN_SECRET) {
    return renderTokenAdminPage({
      error:
        "Admin secret is not configured. Set the TOKEN_ADMIN_SECRET variable to enable updates.",
    });
  }

  if (!env.hkust_token) {
    return renderTokenAdminPage({
      error:
        "KV namespace binding is missing. Verify that hkust_token is configured in wrangler.toml.",
    });
  }

  const form = await request.formData();
  const secret = form.get("secret")?.toString().trim() ?? "";
  const token = form.get("token")?.toString().trim() ?? "";

  if (!secret || secret !== env.TOKEN_ADMIN_SECRET) {
    return renderTokenAdminPage({
      error: "Invalid admin secret. Token was not updated.",
    });
  }

  if (!token.toLowerCase().startsWith("bearer ")) {
    return renderTokenAdminPage({
      error: "Token must start with \"Bearer \".",
    });
  }

  try {
    await env.hkust_token.put(USTHING_BEARER_KV_KEY, token);
  } catch (error) {
    console.error("Failed to write token to KV", error);
    return renderTokenAdminPage({
      error: "Unable to write to KV. Check Wrangler bindings and retry.",
    });
  }

  return renderTokenAdminPage({
    message: "Bearer token successfully updated.",
  });
}

export default {
  async fetch(
    request: Request,
    env: Env,
    ctx: ExecutionContext
  ): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/admin/token") {
      return handleTokenAdminRequest(request, env);
    }

    return createApp().fetch(request, env, ctx);
  },

  async queue(batch: MessageBatch<{ outboxId: string }>, env: Env): Promise<void> {
    const service = new DeliveryService(env.APP_DB);
    for (const message of batch.messages) {
      try {
        const claimed = await service.claimOutbox(message.body.outboxId, new Date().toISOString());
        if (claimed) {
          // Decrypt channel, call PushDeer provider, markSent/markFailed
          // Full integration in P3T5
          message.ack();
        } else {
          message.ack();
        }
      } catch {
        message.retry();
      }
    }
  },

  async scheduled(
    event: ScheduledEvent,
    env: Env,
    ctx: ExecutionContext
  ): Promise<void> {
    ctx.waitUntil(runScheduledSync(env, new Date(event.scheduledTime)));
  },
};
