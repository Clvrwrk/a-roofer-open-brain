import { createHash, createPublicKey, timingSafeEqual, verify } from "node:crypto";
import type { RuntimeEnv } from "@lib/runtime-env";
import {
  PEC78_CONTRACT_VERSION,
  PEC78_MAYA_PERSONA,
  PEC78_MAYA_SUBJECT,
  PEC78_RUNTIME_OWNER,
  sha256Digest,
} from "./contract";
import { evaluatePec78Policy, type Pec78PolicyDecision } from "./policy.server";

type Json = Record<string, unknown>;
const MAX_HEADER = 8192;

function decodePart(part: string): Json {
  return JSON.parse(Buffer.from(part, "base64url").toString("utf8")) as Json;
}

function parseJwt(jwt: string) {
  const parts = jwt.split(".");
  if (parts.length !== 3) throw new Error("jwt_shape");
  return { header: decodePart(parts[0]), claims: decodePart(parts[1]), signingInput: `${parts[0]}.${parts[1]}`, signature: Buffer.from(parts[2], "base64url") };
}

function equalText(a: string, b: string): boolean {
  const aa = Buffer.from(a); const bb = Buffer.from(b);
  return aa.length === bb.length && timingSafeEqual(aa, bb);
}

export interface Pec78VerifiedRequest {
  subject: typeof PEC78_MAYA_SUBJECT;
  personaId: typeof PEC78_MAYA_PERSONA;
  runtimeOwnerId: typeof PEC78_RUNTIME_OWNER;
  runtimeInstanceId: string;
  credentialId: string;
  capability: string;
  accessJti: string;
  proofJti: string;
}

export type Pec78Verification = { ok: true; identity: Pec78VerifiedRequest; policy: Extract<Pec78PolicyDecision, { allow: true }> } | { ok: false; status: number; code: string };

export async function verifyPec78Request(request: Request, env: RuntimeEnv): Promise<Pec78Verification> {
  try {
    const contract = request.headers.get("x-pec78-contract");
    if (contract !== PEC78_CONTRACT_VERSION) return { ok: false, status: 403, code: "contract_version_denied" };
    if (request.method !== "GET" && request.headers.get("content-type")?.split(";", 1)[0] !== "application/json") {
      return { ok: false, status: 422, code: "invalid_request" };
    }
    const auth = request.headers.get("authorization") ?? "";
    const proofJwt = request.headers.get("dpop") ?? "";
    if (auth.length > MAX_HEADER || proofJwt.length > MAX_HEADER || !auth.startsWith("DPoP ") || !proofJwt) {
      return { ok: false, status: 401, code: "authentication_required" };
    }
    const accessJwt = auth.slice(5);
    const access = parseJwt(accessJwt); const proof = parseJwt(proofJwt);
    if (access.header.alg !== "EdDSA" || proof.header.alg !== "EdDSA" || proof.header.typ !== "dpop+jwt") {
      return { ok: false, status: 401, code: "invalid_proof" };
    }
    const publicJwkText = env.PEC78_MAYA_PUBLIC_JWK;
    if (!publicJwkText) return { ok: false, status: 503, code: "authorization_state_unavailable" };
    const publicJwk = JSON.parse(publicJwkText) as Json;
    const key = createPublicKey({ key: publicJwk as never, format: "jwk" });
    for (const token of [access, proof]) {
      if (!verify(null, Buffer.from(token.signingInput), key, token.signature)) return { ok: false, status: 401, code: "invalid_proof" };
    }
    const now = Math.floor(Date.now() / 1000);
    const issuer = "https://cc.proexteriorsus.net/agent/runtime/v1";
    const audience = "https://cc.proexteriorsus.net/api/agent/runtime/v1";
    const c = access.claims; const p = proof.claims;
    if (c.iss !== issuer || c.aud !== audience || c.sub !== PEC78_MAYA_SUBJECT || c.persona_id !== PEC78_MAYA_PERSONA || c.runtime_owner_id !== PEC78_RUNTIME_OWNER || c.contract_version !== PEC78_CONTRACT_VERSION) {
      return { ok: false, status: 401, code: "invalid_proof" };
    }
    if (typeof c.iat !== "number" || typeof c.nbf !== "number" || typeof c.exp !== "number" || c.iat < now - 300 || c.nbf > now || c.exp <= now || c.exp > c.iat + 300) {
      return { ok: false, status: 401, code: "invalid_proof" };
    }
    const url = new URL(request.url);
    const canonicalUrl = `${url.origin}${url.pathname}${url.search}`;
    const body = request.method === "GET" ? "" : await request.clone().text();
    const ath = createHash("sha256").update(accessJwt).digest("base64url");
    if (p.htm !== request.method || p.htu !== canonicalUrl || p.ath !== ath || p.body_sha256 !== sha256Digest(body) || typeof p.iat !== "number" || Math.abs(now - p.iat) > 30) {
      return { ok: false, status: 401, code: "invalid_proof" };
    }
    const required = [c.runtime_instance_id, c.credential_id, c.capability, c.jti, p.jti];
    if (required.some((v) => typeof v !== "string" || !v)) return { ok: false, status: 401, code: "invalid_proof" };
    const decision = evaluatePec78Policy({ contractVersion: String(c.contract_version), subject: String(c.sub), personaId: String(c.persona_id), capability: String(c.capability), method: request.method, pathname: url.pathname });
    if (!decision.allow) return { ok: false, status: 403, code: decision.code };
    const configuredThumbprint = env.PEC78_MAYA_JWK_THUMBPRINT;
    if (!configuredThumbprint || !equalText(configuredThumbprint, sha256Digest(JSON.stringify(publicJwk)))) return { ok: false, status: 401, code: "invalid_proof" };
    return { ok: true, identity: { subject: PEC78_MAYA_SUBJECT, personaId: PEC78_MAYA_PERSONA, runtimeOwnerId: PEC78_RUNTIME_OWNER, runtimeInstanceId: String(c.runtime_instance_id), credentialId: String(c.credential_id), capability: String(c.capability), accessJti: String(c.jti), proofJti: String(p.jti) }, policy: decision };
  } catch {
    return { ok: false, status: 401, code: "invalid_proof" };
  }
}
