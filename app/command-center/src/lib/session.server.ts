import { getRuntimeEnv, type RuntimeEnv } from "@lib/runtime-env";
import { getWorkOs } from "@lib/workos.server";

export const SESSION_COOKIE = "wos-session";

export const SESSION_COOKIE_OPTIONS = {
  path: "/",
  httpOnly: true,
  secure: true,
  sameSite: "lax",
} as const;

export interface SessionUser {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
}

export type SessionResult =
  | { status: "unauthenticated"; reason: string }
  | { status: "authenticated"; user: SessionUser; refreshedSealedSession: string | null };

function toSessionUser(user: { id: string; email: string; firstName?: string | null; lastName?: string | null }): SessionUser {
  return {
    id: user.id,
    email: user.email.trim().toLowerCase(),
    firstName: user.firstName ?? null,
    lastName: user.lastName ?? null,
  };
}

/**
 * Validate the sealed session cookie. If the access token has expired,
 * attempt a refresh and hand the new sealed session back to the caller so
 * the cookie can be re-set. Fail closed on every error path.
 */
export async function authenticateSession(
  sessionData: string | undefined,
  env: RuntimeEnv = getRuntimeEnv(),
): Promise<SessionResult> {
  if (!sessionData) return { status: "unauthenticated", reason: "no_session_cookie" };

  const cookiePassword = env.WORKOS_COOKIE_PASSWORD;
  if (!cookiePassword) return { status: "unauthenticated", reason: "cookie_password_missing" };

  let session;
  try {
    session = getWorkOs(env).userManagement.loadSealedSession({ sessionData, cookiePassword });
  } catch {
    return { status: "unauthenticated", reason: "session_unreadable" };
  }

  try {
    const result = await session.authenticate();
    if (result.authenticated) {
      return { status: "authenticated", user: toSessionUser(result.user), refreshedSealedSession: null };
    }

    if (result.reason === "no_session_cookie_provided") {
      return { status: "unauthenticated", reason: "no_session_cookie" };
    }
  } catch {
    return { status: "unauthenticated", reason: "authenticate_failed" };
  }

  try {
    const refreshed = await session.refresh({ cookiePassword });
    if (refreshed.authenticated && refreshed.sealedSession && refreshed.user) {
      return {
        status: "authenticated",
        user: toSessionUser(refreshed.user),
        refreshedSealedSession: refreshed.sealedSession,
      };
    }
  } catch {
    // fall through to unauthenticated
  }

  return { status: "unauthenticated", reason: "refresh_failed" };
}

export async function getSessionLogoutUrl(sessionData: string | undefined, env: RuntimeEnv = getRuntimeEnv()) {
  const cookiePassword = env.WORKOS_COOKIE_PASSWORD;
  if (!sessionData || !cookiePassword) return null;

  try {
    const session = getWorkOs(env).userManagement.loadSealedSession({ sessionData, cookiePassword });
    return await session.getLogoutUrl();
  } catch {
    return null;
  }
}

/**
 * Only allow same-origin relative paths as post-login destinations.
 * Rejects absolute URLs, protocol-relative URLs, and backslash tricks.
 */
export function sanitizeReturnTo(value: string | null | undefined): string {
  if (!value) return "/";
  const candidate = value.trim();

  if (!candidate.startsWith("/")) return "/";
  if (candidate.startsWith("//")) return "/";
  if (candidate.includes("\\")) return "/";
  if (candidate.startsWith("/auth/")) return "/";

  return candidate;
}

/** Same-origin check for state-changing auth POSTs (global checkOrigin is off). */
export function isSameOriginRequest(request: Request, env: RuntimeEnv = getRuntimeEnv()) {
  const allowed = new Set<string>();

  const publicUrl = env.COMMAND_CENTER_PUBLIC_URL;
  if (publicUrl) {
    try {
      allowed.add(new URL(publicUrl).origin);
    } catch {
      // ignore malformed configured URL
    }
  }

  try {
    allowed.add(new URL(request.url).origin);
  } catch {
    // ignore
  }

  const source = request.headers.get("origin") ?? request.headers.get("referer");
  if (!source) return false;

  try {
    return allowed.has(new URL(source).origin);
  } catch {
    return false;
  }
}
