#!/usr/bin/env node
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

const API_BASE_URL = "https://www.orgo.ai/api";
const PLAN_PATH = "deployment/remote/orgo/pro-exteriors-orgo-desktop-plan.json";
const OUTPUT_PATH = "deployment/remote/orgo/pro-exteriors-orgo-desktops.json";

function requiredEnv(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function extractList(payload, key) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.[key])) return payload[key];
  if (Array.isArray(payload?.data)) return payload.data;
  if (Array.isArray(payload?.items)) return payload.items;
  return [];
}

async function request(path, options = {}) {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers: {
      authorization: `Bearer ${requiredEnv("ORGO_API_KEY")}`,
      accept: "application/json",
      "content-type": "application/json",
      ...(options.headers ?? {}),
    },
  });

  const text = await response.text();
  const payload = text ? JSON.parse(text) : null;

  if (!response.ok) {
    const message = payload?.message ?? payload?.error ?? response.statusText;
    const error = new Error(`${options.method ?? "GET"} ${path} failed: ${response.status} ${message}`);
    error.status = response.status;
    error.payload = payload;
    throw error;
  }

  return payload;
}

async function readPlan(path = PLAN_PATH) {
  return JSON.parse(await readFile(path, "utf8"));
}

async function readExistingRegistry(path = OUTPUT_PATH) {
  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch {
    return null;
  }
}

async function listWorkspaces() {
  return extractList(await request("/workspaces"), "workspaces");
}

async function getWorkspace(workspaceId) {
  if (!workspaceId) return null;
  return request(`/workspaces/${encodeURIComponent(workspaceId)}`);
}

async function createWorkspace(name) {
  return request("/workspaces", {
    method: "POST",
    body: JSON.stringify({ name }),
  });
}

async function ensureWorkspace(plan, existingRegistry) {
  const configuredWorkspaceId = process.env[plan.workspaceIdEnv || "ORGO_WORKSPACE_ID"]?.trim();
  if (configuredWorkspaceId) {
    const workspace = await getWorkspace(configuredWorkspaceId);
    return { ...workspace, status: "configured" };
  }

  const name = plan.workspaceName;
  const workspaces = await listWorkspaces();
  const existing = workspaces.find((workspace) => workspace.name === name);
  if (existing) return { ...existing, status: "existing" };

  if (existingRegistry?.workspace?.name === name && existingRegistry.workspace.id) {
    return { ...existingRegistry.workspace, status: "existing_registry" };
  }

  try {
    const created = await createWorkspace(name);
    return { ...created, status: "created" };
  } catch (error) {
    if (error.status === 400 && /already exists/i.test(error.message) && existingRegistry?.workspace?.id) {
      return { ...existingRegistry.workspace, status: "existing_registry" };
    }

    throw error;
  }
}

function findDesktop(workspace, name) {
  return extractList(workspace?.desktops, "desktops").find((desktop) => desktop.name === name);
}

function registryMatchesWorkspace(existingRegistry, workspaceId) {
  return Boolean(existingRegistry?.workspace?.id && existingRegistry.workspace.id === workspaceId);
}

async function createComputer(workspaceId, desktop, autoStopMinutes) {
  return request("/computers", {
    method: "POST",
    body: JSON.stringify({
      workspace_id: workspaceId,
      name: desktop.name,
      os: "linux",
      ram: desktop.ram,
      cpu: desktop.cpu,
      disk_size_gb: desktop.diskSizeGb,
      resolution: desktop.resolution,
      auto_stop_minutes: autoStopMinutes,
    }),
  });
}

async function configureAutoStop(computerId, autoStopMinutes) {
  if (!computerId || typeof autoStopMinutes !== "number") return null;

  return request(`/computers/${encodeURIComponent(computerId)}/auto-stop`, {
    method: "PATCH",
    body: JSON.stringify({
      auto_stop_minutes: autoStopMinutes,
    }),
  });
}

async function getComputer(computerId) {
  if (!computerId) return null;
  return request(`/computers/${encodeURIComponent(computerId)}`).catch(() => null);
}

async function writeJson(path, value) {
  const absolutePath = resolve(path);
  await mkdir(dirname(absolutePath), { recursive: true });
  await writeFile(absolutePath, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o644 });
  return absolutePath;
}

function sanitizeComputer(computer, desktop, status) {
  return {
    personaId: desktop.personaId,
    displayName: desktop.displayName,
    workspaceEmail: desktop.workspaceEmail,
    name: computer.name ?? desktop.name,
    computerId: computer.id ?? null,
    workspaceId: computer.workspace_id ?? null,
    instanceId: computer.instance_id ?? computer.fly_instance_id ?? null,
    status: computer.status ?? null,
    ram: computer.ram ?? desktop.ram,
    cpu: computer.cpu ?? desktop.cpu,
    diskSizeGb: computer.disk_size_gb ?? desktop.diskSizeGb,
    resolution: computer.resolution ?? desktop.resolution,
    autoStopMinutes: computer.auto_stop_minutes ?? null,
    dashboardUrl: computer.url ?? null,
    connectionUrl: computer.connection_url ?? null,
    primaryUse: desktop.primaryUse,
    provisionStatus: status,
  };
}

async function main() {
  const plan = await readPlan(process.env.ORGO_DESKTOP_PLAN_PATH || PLAN_PATH);
  const outputPath = process.env.ORGO_DESKTOP_OUTPUT_PATH || OUTPUT_PATH;
  const existingRegistry = await readExistingRegistry(outputPath);
  const workspace = await ensureWorkspace(plan, existingRegistry);
  const currentWorkspace = await getWorkspace(workspace.id).catch(() => workspace);
  const canReuseRegistryComputers = registryMatchesWorkspace(existingRegistry, workspace.id);

  const computers = [];
  for (const desktop of plan.desktops) {
    const existingRegistryComputer = canReuseRegistryComputers
      ? existingRegistry?.computers?.find((computer) => computer.name === desktop.name)
      : null;
    const existing = findDesktop(currentWorkspace, desktop.name) ?? existingRegistryComputer;
    if (existing) {
      const current = await getComputer(existing.id ?? existing.computerId);
      const updated = await configureAutoStop(existing.id ?? existing.computerId, plan.autoStopMinutes).catch(() => null);
      computers.push(sanitizeComputer(current ?? existing, desktop, "existing"));
      if (updated?.auto_stop_minutes !== undefined) {
        computers[computers.length - 1].autoStopMinutes = updated.auto_stop_minutes;
      }
      continue;
    }

    const created = await createComputer(workspace.id, desktop, plan.autoStopMinutes);
    const updated = await configureAutoStop(created.id, plan.autoStopMinutes).catch(() => null);
    if (updated?.auto_stop_minutes !== undefined) created.auto_stop_minutes = updated.auto_stop_minutes;
    computers.push(sanitizeComputer(created, desktop, "created"));
  }

  const writtenPath = await writeJson(outputPath, {
    generatedAt: new Date().toISOString(),
    workspace: {
      id: workspace.id,
      name: workspace.name ?? plan.workspaceName,
      status: workspace.status,
      provisionStatus: workspace.status === "created" ? "created" : workspace.status,
    },
    autoStopMinutes: plan.autoStopMinutes,
    computers,
    workspaceOnly: plan.workspaceOnly,
  });

  const created = computers.filter((computer) => computer.provisionStatus === "created").length;
  console.log(
    JSON.stringify(
      {
        status: "ok",
        workspace: {
          id: workspace.id,
          name: workspace.name ?? plan.workspaceName,
          provisionStatus: workspace.status,
        },
        computers: {
          total: computers.length,
          created,
          existing: computers.length - created,
        },
        output: writtenPath,
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(
    JSON.stringify(
      {
        status: "error",
        message: error.message,
        statusCode: error.status ?? null,
      },
      null,
      2,
    ),
  );
  process.exitCode = 1;
});
