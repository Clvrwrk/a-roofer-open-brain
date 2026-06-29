import { App, LogLevel } from "@slack/bolt";
import { createClient } from "@supabase/supabase-js";
import { pathToFileURL } from "node:url";
import { handleRoofingOpsFileShared, handleRoofingOpsMessage } from "./roofing-ops-agent-router.mjs";

const COMMAND_ROUTES = new Map([
  [
    "/pe-ob",
    {
      owner: "Conductor",
      next: "routing this to the right Open Brain work queue",
    },
  ],
  [
    "/pe-credit",
    {
      owner: "Accounting",
      next: "preparing a credit memo review packet",
    },
  ],
  [
    "/pe-catalog",
    {
      owner: "Accounting + Operations",
      next: "capturing product catalog or UOM review needs",
    },
  ],
  [
    "/pe-intake",
    {
      owner: "Capture",
      next: "starting a vendor intake triage trail",
    },
  ],
]);

const REQUIRED_ENV = ["SLACK_BOT_TOKEN", "SLACK_APP_TOKEN", "SLACK_SIGNING_SECRET"];
const MIRROR_POLL_MS = 15000;

function redactId(value) {
  if (!value || value.length < 8) return value ? "[redacted]" : null;
  return `${value.slice(0, 4)}...${value.slice(-4)}`;
}

function parseCsvSet(value) {
  return new Set(
    String(value ?? "")
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean),
  );
}

function expectedTeamAllows(teamId, env) {
  return !env.SLACK_TEAM_ID || env.SLACK_TEAM_ID === teamId;
}

function userAllows(userId, env) {
  const allowedUsers = parseCsvSet(env.SLACK_ALLOWED_USER_IDS);
  return allowedUsers.size === 0 || allowedUsers.has(userId);
}

function logRuntime(event, details = {}) {
  console.log(
    JSON.stringify({
      service: "slack-socket-runtime",
      event,
      ...details,
      timestamp: new Date().toISOString(),
    }),
  );
}

function createSupabaseClient(env) {
  const url = env.SUPABASE_URL || env.PUBLIC_SUPABASE_URL;
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;

  return createClient(url, key, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
    global: {
      headers: {
        "x-open-brain-client": "command-center-slack-runtime",
      },
    },
  });
}

function mirrorText(row) {
  const payload = row.payload && typeof row.payload === "object" ? row.payload : {};
  return String(
    payload.text ??
      `${payload.actor ?? "Open Brain"} recorded ${payload.decision ?? "an action"} for ${payload.title ?? row.work_key}.`,
  );
}

async function drainSlackMirrorQueue({ client, slack, env }) {
  const fallbackChannel = env.SLACK_OB_CONDUCTOR_DIGEST_CHANNEL_ID || env.SLACK_OB_AGENT_AUDIT_LOG_CHANNEL_ID;
  const { data, error } = await client
    .from("slack_mirror_events")
    .select("id,work_key,channel_id,thread_ts,payload")
    .eq("status", "queued")
    .order("created_at", { ascending: true })
    .limit(10);

  if (error) {
    logRuntime("mirror_query_failed", { message: error.message });
    return;
  }

  for (const row of data ?? []) {
    const channel = row.channel_id || fallbackChannel;
    if (!channel) {
      await client
        .from("slack_mirror_events")
        .update({
          error_message: "No Slack channel configured for queued mirror event.",
          status: "skipped",
        })
        .eq("id", row.id);
      continue;
    }

    try {
      const posted = await slack.chat.postMessage({
        channel,
        text: mirrorText(row),
        thread_ts: row.thread_ts || undefined,
      });

      await client
        .from("slack_mirror_events")
        .update({
          message_ts: posted.ts ?? null,
          sent_at: new Date().toISOString(),
          status: "sent",
        })
        .eq("id", row.id);

      logRuntime("mirror_sent", {
        eventId: redactId(row.id),
        workKey: row.work_key,
      });
    } catch (error) {
      await client
        .from("slack_mirror_events")
        .update({
          error_message: error?.message ?? "Slack mirror post failed.",
          status: "failed",
        })
        .eq("id", row.id);

      logRuntime("mirror_failed", {
        eventId: redactId(row.id),
        message: error?.message ?? "Slack mirror post failed.",
      });
    }
  }
}

function startSlackMirrorDrain(app, env) {
  const client = createSupabaseClient(env);
  if (!client) {
    logRuntime("mirror_skipped_missing_supabase_env");
    return null;
  }

  const drain = () => {
    drainSlackMirrorQueue({ client, env, slack: app.client }).catch((error) => {
      logRuntime("mirror_drain_fatal", {
        message: error?.message ?? "Slack mirror drain failed.",
      });
    });
  };

  drain();
  const timer = setInterval(drain, Number(env.SLACK_MIRROR_POLL_MS || MIRROR_POLL_MS));
  timer.unref?.();
  logRuntime("mirror_drain_started");
  return timer;
}

function buildCommandReply(commandName) {
  const route = COMMAND_ROUTES.get(commandName) ?? COMMAND_ROUTES.get("/pe-ob");
  return [
    `Received by ob-conductor. Owner: ${route.owner}.`,
    `For this first live pass, I am confirming Slack delivery and ${route.next}.`,
    "Write-side actions are still disabled until the queue and approval gates are connected.",
  ].join("\n");
}


async function respondEphemeral(respond, text) {
  await respond({
    response_type: "ephemeral",
    text,
  });
}

function registerSlashCommands(app, env) {
  for (const commandName of COMMAND_ROUTES.keys()) {
    app.command(commandName, async ({ command, ack, respond, logger }) => {
      await ack();

      if (!expectedTeamAllows(command.team_id, env)) {
        logger.warn("Rejected Slack command from unexpected team", {
          command: command.command,
          team: redactId(command.team_id),
        });
        return;
      }

      if (!userAllows(command.user_id, env)) {
        await respondEphemeral(
          respond,
          "You are not on the Open Brain Slack allowlist yet. Ask an admin to add your Slack user ID.",
        );
        return;
      }

      logRuntime("slash_command", {
        command: command.command,
        team: redactId(command.team_id),
        channel: redactId(command.channel_id),
        user: redactId(command.user_id),
      });

      await respondEphemeral(respond, buildCommandReply(command.command));
    });
  }
}

function startDmPoller(app, env) {
  if (String(env.ROOFING_OPS_DM_POLL_ENABLED ?? "true") === "false") return null;
  const seen = new Set();
  let initialized = false;
  const pollMs = Number(env.ROOFING_OPS_DM_POLL_MS || 10000);
  const poll = async () => {
    try {
      const list = await app.client.conversations.list({ types: "im", limit: 100 });
      for (const channel of list.channels ?? []) {
        if (!channel.id) continue;
        const hist = await app.client.conversations.history({ channel: channel.id, limit: 3 });
        for (const msg of (hist.messages ?? []).reverse()) {
          if (!msg.ts || seen.has(`${channel.id}:${msg.ts}`)) continue;
          seen.add(`${channel.id}:${msg.ts}`);
          if (!initialized) continue;
          if (msg.bot_id || (msg.subtype && msg.subtype !== "file_share") || !msg.user || (!msg.text && !(msg.files ?? []).length)) continue;
          await handleRoofingOpsMessage({
            message: { ...msg, channel: channel.id, channel_type: "im" },
            context: { teamId: env.SLACK_TEAM_ID },
            client: app.client,
            env,
            logger: console,
          });
        }
      }
      initialized = true;
    } catch (error) {
      console.error(JSON.stringify({ service: "slack-socket-runtime", event: "dm_poll_failed", message: error?.message ?? String(error), timestamp: new Date().toISOString() }));
    }
  };
  setTimeout(poll, 2000).unref?.();
  const timer = setInterval(poll, pollMs);
  timer.unref?.();
  logRuntime("dm_poller_started", { pollMs });
  return timer;
}

function registerEvents(app, env) {
  app.event("app_mention", async ({ event, context, client, logger }) => {
    const teamId = context.teamId ?? event.team;
    if (!expectedTeamAllows(teamId, env) || !userAllows(event.user, env)) return;

    logRuntime("app_mention", {
      team: redactId(teamId),
      channel: redactId(event.channel),
      user: redactId(event.user),
    });

    try {
      await handleRoofingOpsMessage({ message: { ...event, channel_type: event.channel_type ?? "channel" }, context, client, env, logger });
    } catch (error) {
      logger.error("Failed to route app mention", error);
    }
  });

  app.message(async ({ message, context, client, logger }) => {
    if (message.bot_id || (message.subtype && message.subtype !== "file_share")) return;

    const teamId = context.teamId ?? message.team;
    if (!expectedTeamAllows(teamId, env) || !userAllows(message.user, env)) return;

    logRuntime("message", {
      team: redactId(teamId),
      channel: redactId(message.channel),
      user: redactId(message.user),
      channelType: message.channel_type,
    });

    try {
      await handleRoofingOpsMessage({ message, context, client, env, logger });
    } catch (error) {
      logger.error("Failed to route Roofing-Ops message", error);
    }
  });

  app.event("file_shared", async ({ event, context, client, logger }) => {
    const teamId = context.teamId ?? event.team_id;
    if (!expectedTeamAllows(teamId, env) || !userAllows(event.user_id, env)) return;

    logRuntime("file_shared", {
      team: redactId(teamId),
      file: redactId(event.file_id),
      user: redactId(event.user_id),
    });

    try {
      await handleRoofingOpsFileShared({ event, context, client, env, logger });
    } catch (error) {
      logger.error("Failed to route Roofing-Ops file share", error);
    }
  });
}

export function getMissingSlackRuntimeEnv(env = process.env) {
  return REQUIRED_ENV.filter((name) => !env[name]);
}

export function createSlackSocketRuntime(env = process.env) {
  const app = new App({
    token: env.SLACK_BOT_TOKEN,
    appToken: env.SLACK_APP_TOKEN,
    signingSecret: env.SLACK_SIGNING_SECRET,
    socketMode: true,
    logLevel: LogLevel[env.SLACK_LOG_LEVEL] ?? LogLevel.INFO,
  });

  registerSlashCommands(app, env);
  registerEvents(app, env);

  app.error(async (error) => {
    console.error(
      JSON.stringify({
        service: "slack-socket-runtime",
        event: "bolt_error",
        message: error?.message ?? "Unknown Slack runtime error",
        timestamp: new Date().toISOString(),
      }),
    );
  });

  return app;
}

export async function startSlackSocketRuntime(env = process.env) {
  const missing = getMissingSlackRuntimeEnv(env);
  if (missing.length > 0) {
    throw new Error(`Slack Socket Mode runtime missing env: ${missing.join(", ")}`);
  }

  const app = createSlackSocketRuntime(env);
  await app.start();
  startSlackMirrorDrain(app, env);
  startDmPoller(app, env);

  logRuntime("started", {
    socketMode: true,
    teamConfigured: Boolean(env.SLACK_TEAM_ID),
    allowlistConfigured: parseCsvSet(env.SLACK_ALLOWED_USER_IDS).size > 0,
  });

  return app;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  startSlackSocketRuntime().catch((error) => {
    console.error(
      JSON.stringify({
        service: "slack-socket-runtime",
        event: "fatal",
        message: error?.message ?? "Unknown fatal startup error",
        timestamp: new Date().toISOString(),
      }),
    );
    process.exitCode = 1;
  });
}
