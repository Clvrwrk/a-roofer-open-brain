import { App, LogLevel } from "@slack/bolt";
import { pathToFileURL } from "node:url";

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

function buildCommandReply(commandName) {
  const route = COMMAND_ROUTES.get(commandName) ?? COMMAND_ROUTES.get("/pe-ob");
  return [
    `Received by ob-conductor. Owner: ${route.owner}.`,
    `For this first live pass, I am confirming Slack delivery and ${route.next}.`,
    "Write-side actions are still disabled until the queue and approval gates are connected.",
  ].join("\n");
}

function buildMentionReply() {
  return [
    "I am online as ob-conductor.",
    "I can receive this Slack event and route it into the Open Brain runtime next.",
    "For now, I am staying read-only and will not change Supabase records from Slack.",
  ].join("\n");
}

function buildDmReply() {
  return [
    "I am online and receiving DMs.",
    "Use `/pe-ob`, `/pe-intake`, `/pe-catalog`, or `/pe-credit` in Slack for the first routed command surfaces.",
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
      await client.chat.postMessage({
        channel: event.channel,
        thread_ts: event.thread_ts ?? event.ts,
        text: buildMentionReply(),
      });
    } catch (error) {
      logger.error("Failed to respond to app mention", error);
    }
  });

  app.message(async ({ message, context, client, logger }) => {
    if (message.subtype || message.bot_id || message.channel_type !== "im") return;

    const teamId = context.teamId ?? message.team;
    if (!expectedTeamAllows(teamId, env) || !userAllows(message.user, env)) return;

    logRuntime("direct_message", {
      team: redactId(teamId),
      channel: redactId(message.channel),
      user: redactId(message.user),
    });

    try {
      await client.chat.postMessage({
        channel: message.channel,
        thread_ts: message.thread_ts ?? message.ts,
        text: buildDmReply(),
      });
    } catch (error) {
      logger.error("Failed to respond to direct message", error);
    }
  });

  app.event("file_shared", async ({ event, context, logger }) => {
    const teamId = context.teamId ?? event.team_id;
    if (!expectedTeamAllows(teamId, env) || !userAllows(event.user_id, env)) return;

    logRuntime("file_shared", {
      team: redactId(teamId),
      file: redactId(event.file_id),
      user: redactId(event.user_id),
    });

    logger.info("File share received; write-side intake is not enabled in this runtime yet.");
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
