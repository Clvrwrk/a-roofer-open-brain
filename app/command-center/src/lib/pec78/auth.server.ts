import { createHash, createPrivateKey, createPublicKey, randomUUID, sign, timingSafeEqual, verify } from "node:crypto";
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

function encodePart(value: Json): string {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

export function pec78JwkThumbprint(jwk: Json): string {
  if (jwk.kty !== "OKP" || jwk.crv !== "Ed25519" || typeof jwk.x !== "string") throw new Error("unsupported_jwk");
  const canonical = JSON.stringify({ crv: jwk.crv, kty: jwk.kty, x: jwk.x });
  return createHash("sha256").update(canonical).digest("base64url");
}

export function pec78KeysSeparated(env: RuntimeEnv): boolean {
  try {
    if (!env.PEC78_MAYA_PUBLIC_JWK || !env.PEC78_ISSUER_PUBLIC_JWK || !env.PEC78_ISSUER_PRIVATE_JWK) return false;
    const maya = pec78JwkThumbprint(JSON.parse(env.PEC78_MAYA_PUBLIC_JWK) as Json);
    const issuerPublic = JSON.parse(env.PEC78_ISSUER_PUBLIC_JWK) as Json;
    const issuerPrivateKey = createPrivateKey({ key: JSON.parse(env.PEC78_ISSUER_PRIVATE_JWK) as never, format: "jwk" });
    const derivedIssuer = createPublicKey(issuerPrivateKey).export({ format: "jwk" }) as Json;
    return !equalText(maya, pec78JwkThumbprint(issuerPublic)) &&
      equalText(pec78JwkThumbprint(issuerPublic), pec78JwkThumbprint(derivedIssuer));
  } catch { return false; }
}

export function issuePec78AccessToken(input: {
  env: RuntimeEnv; capability: string; credentialId: string; runtimeInstanceId: string; proofThumbprint: string; now?: number;
}): string {
  const privateText = input.env.PEC78_ISSUER_PRIVATE_JWK;
  if (!privateText || !pec78KeysSeparated(input.env)) throw new Error("issuer_unavailable");
  const privateJwk = JSON.parse(privateText) as Json;
  const now = input.now ?? Math.floor(Date.now() / 1000);
  const header = encodePart({ alg: "EdDSA", typ: "at+jwt", kid: input.env.PEC78_ISSUER_KEY_ID ?? "pec78-issuer-v1" });
  const claims = encodePart({
    iss: "https://cc.proexteriorsus.net/agent/runtime/v1",
    aud: "https://cc.proexteriorsus.net/api/agent/runtime/v1",
    sub: PEC78_MAYA_SUBJECT, persona_id: PEC78_MAYA_PERSONA, runtime_owner_id: PEC78_RUNTIME_OWNER,
    contract_version: PEC78_CONTRACT_VERSION, runtime_instance_id: input.runtimeInstanceId,
    credential_id: input.credentialId, capability: input.capability, cnf: { jkt: input.proofThumbprint },
    jti: randomUUID(), iat: now, nbf: now - 2, exp: now + 120,
  });
  const signingInput = `${header}.${claims}`;
  const key = createPrivateKey({ key: privateJwk as never, format: "jwk" });
  return `${signingInput}.${sign(null, Buffer.from(signingInput), key).toString("base64url")}`;
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

export async function verifyPec78TokenProof(request: Request, env: RuntimeEnv): Promise<
  { ok: true; proofJti: string; proofThumbprint: string } | { ok: false; status: number; code: string }
> {
  try {
    if (request.headers.get("x-pec78-contract") !== PEC78_CONTRACT_VERSION ||
        request.headers.get("content-type")?.split(";", 1)[0] !== "application/json") {
      return { ok: false, status: 422, code: "invalid_request" };
    }
    const proofText = request.headers.get("dpop") ?? "";
    if (!proofText || proofText.length > MAX_HEADER) return { ok: false, status: 401, code: "authentication_required" };
    const proof = parseJwt(proofText);
    if (proof.header.alg !== "EdDSA" || proof.header.typ !== "dpop+jwt") return { ok: false, status: 401, code: "invalid_proof" };
    const mayaPublicText = env.PEC78_MAYA_PUBLIC_JWK;
    if (!mayaPublicText) return { ok: false, status: 503, code: "authorization_state_unavailable" };
    const mayaPublic = JSON.parse(mayaPublicText) as Json;
    const thumbprint = pec78JwkThumbprint(mayaPublic);
    if (!env.PEC78_MAYA_JWK_THUMBPRINT || !equalText(env.PEC78_MAYA_JWK_THUMBPRINT, thumbprint)) {
      return { ok: false, status: 401, code: "invalid_proof" };
    }
    const key = createPublicKey({ key: mayaPublic as never, format: "jwk" });
    if (!verify(null, Buffer.from(proof.signingInput), key, proof.signature)) return { ok: false, status: 401, code: "invalid_proof" };
    const url = new URL(request.url); const body = await request.clone().text(); const now = Math.floor(Date.now() / 1000); const p = proof.claims;
    if (url.protocol !== "https:" || p.htm !== "POST" || p.htu !== `${url.origin}${url.pathname}${url.search}` ||
        p.body_sha256 !== sha256Digest(body) || typeof p.iat !== "number" || Math.abs(now - p.iat) > 30 ||
        typeof p.jti !== "string" || !p.jti) return { ok: false, status: 401, code: "invalid_proof" };
    return { ok: true, proofJti: String(p.jti), proofThumbprint: thumbprint };
  } catch {
    return { ok: false, status: 401, code: "invalid_proof" };
  }
}

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
    if (access.header.alg !== "EdDSA" || access.header.typ !== "at+jwt" || access.header.kid !== (env.PEC78_ISSUER_KEY_ID ?? "pec78-issuer-v1") ||
        proof.header.alg !== "EdDSA" || proof.header.typ !== "dpop+jwt") {
      return { ok: false, status: 401, code: "invalid_proof" };
    }
    const mayaPublicText = env.PEC78_MAYA_PUBLIC_JWK;
    const issuerPublicText = env.PEC78_ISSUER_PUBLIC_JWK;
    if (!mayaPublicText || !issuerPublicText || !pec78KeysSeparated(env)) return { ok: false, status: 503, code: "authorization_state_unavailable" };
    const mayaPublic = JSON.parse(mayaPublicText) as Json;
    const issuerPublic = JSON.parse(issuerPublicText) as Json;
    const mayaKey = createPublicKey({ key: mayaPublic as never, format: "jwk" });
    const issuerKey = createPublicKey({ key: issuerPublic as never, format: "jwk" });
    if (!verify(null, Buffer.from(access.signingInput), issuerKey, access.signature) ||
        !verify(null, Buffer.from(proof.signingInput), mayaKey, proof.signature)) {
      return { ok: false, status: 401, code: "invalid_proof" };
    }
    const now = Math.floor(Date.now() / 1000);
    const issuer = "https://cc.proexteriorsus.net/agent/runtime/v1";
    const audience = "https://cc.proexteriorsus.net/api/agent/runtime/v1";
    const c = access.claims; const p = proof.claims;
    if (c.iss !== issuer || c.aud !== audience || c.sub !== PEC78_MAYA_SUBJECT || c.persona_id !== PEC78_MAYA_PERSONA || c.runtime_owner_id !== PEC78_RUNTIME_OWNER || c.contract_version !== PEC78_CONTRACT_VERSION) {
      return { ok: false, status: 401, code: "invalid_proof" };
    }
    if (typeof c.iat !== "number" || typeof c.nbf !== "number" || typeof c.exp !== "number" || c.iat > now + 5 || c.iat < now - 180 || c.nbf > now + 5 || c.exp <= now || c.exp > c.iat + 120) {
      return { ok: false, status: 401, code: "invalid_proof" };
    }
    const url = new URL(request.url);
    const canonicalUrl = `${url.origin}${url.pathname}${url.search}`;
    const body = request.method === "GET" ? "" : await request.clone().text();
    const ath = createHash("sha256").update(accessJwt).digest("base64url");
    if (url.protocol !== "https:" || p.htm !== request.method || p.htu !== canonicalUrl || p.ath !== ath || p.body_sha256 !== sha256Digest(body) || typeof p.iat !== "number" || Math.abs(now - p.iat) > 30) {
      return { ok: false, status: 401, code: "invalid_proof" };
    }
    const required = [c.runtime_instance_id, c.credential_id, c.capability, c.jti, p.jti];
    if (required.some((v) => typeof v !== "string" || !v)) return { ok: false, status: 401, code: "invalid_proof" };
    const decision = evaluatePec78Policy({ contractVersion: String(c.contract_version), subject: String(c.sub), personaId: String(c.persona_id), capability: String(c.capability), method: request.method, pathname: url.pathname });
    if (!decision.allow) return { ok: false, status: 403, code: decision.code };
    const configuredThumbprint = env.PEC78_MAYA_JWK_THUMBPRINT;
    const actualThumbprint = pec78JwkThumbprint(mayaPublic);
    const cnf = c.cnf as Json | undefined;
    if (!configuredThumbprint || !equalText(configuredThumbprint, actualThumbprint) || !cnf || !equalText(String(cnf.jkt ?? ""), actualThumbprint)) {
      return { ok: false, status: 401, code: "invalid_proof" };
    }
    return { ok: true, identity: { subject: PEC78_MAYA_SUBJECT, personaId: PEC78_MAYA_PERSONA, runtimeOwnerId: PEC78_RUNTIME_OWNER, runtimeInstanceId: String(c.runtime_instance_id), credentialId: String(c.credential_id), capability: String(c.capability), accessJti: String(c.jti), proofJti: String(p.jti) }, policy: decision };
  } catch {
    return { ok: false, status: 401, code: "invalid_proof" };
  }
}
