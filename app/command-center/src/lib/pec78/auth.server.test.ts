import { createPrivateKey, createPublicKey, generateKeyPairSync, randomUUID, sign, verify } from "node:crypto";
import { describe, expect, it } from "vitest";
import { issuePec78AccessToken, pec78JwkThumbprint, verifyPec78TokenProof } from "./auth.server";
import { PEC78_CONTRACT_VERSION, sha256Digest } from "./contract";

function pair() {
  const { privateKey, publicKey } = generateKeyPairSync("ed25519");
  return {
    privateJwk: privateKey.export({ format: "jwk" }),
    publicJwk: publicKey.export({ format: "jwk" }),
  };
}

function dpop(privateJwk: JsonWebKey, url: string, body: string): string {
  const encode = (value: Record<string, unknown>) => Buffer.from(JSON.stringify(value)).toString("base64url");
  const header = encode({ alg: "EdDSA", typ: "dpop+jwt" });
  const claims = encode({ htm: "POST", htu: url, body_sha256: sha256Digest(body), iat: Math.floor(Date.now() / 1_000), jti: randomUUID() });
  const input = `${header}.${claims}`;
  const key = createPrivateKey({ key: privateJwk, format: "jwk" });
  return `${input}.${sign(null, Buffer.from(input), key).toString("base64url")}`;
}

function tokenRequest(internalUrl: string, proofUrl: string, privateJwk: JsonWebKey): Request {
  const body = JSON.stringify({ capability: "slack.send.christopher", credentialId: randomUUID(), runtimeInstanceId: randomUUID() });
  return new Request(internalUrl, {
    method: "POST",
    headers: { "content-type": "application/json", "x-pec78-contract": PEC78_CONTRACT_VERSION, dpop: dpop(privateJwk, proofUrl, body) },
    body,
  });
}

describe("PEC-78 issuer separation", () => {
  it("uses RFC 7638 canonical OKP thumbprints", () => {
    const { publicJwk } = pair();
    expect(pec78JwkThumbprint({ ...publicJwk, kid: "ignored" })).toBe(pec78JwkThumbprint(publicJwk));
  });

  it("signs access tokens with the issuer key, not Maya's proof key", () => {
    const issuer = pair(); const maya = pair();
    const token = issuePec78AccessToken({
      env: { PEC78_ISSUER_PRIVATE_JWK: JSON.stringify(issuer.privateJwk), PEC78_ISSUER_PUBLIC_JWK: JSON.stringify(issuer.publicJwk), PEC78_MAYA_PUBLIC_JWK: JSON.stringify(maya.publicJwk), PEC78_ISSUER_KEY_ID: "issuer-test" },
      capability: "slack.send.christopher", credentialId: crypto.randomUUID(), runtimeInstanceId: crypto.randomUUID(),
      proofThumbprint: pec78JwkThumbprint(maya.publicJwk), now: 1_000,
    });
    const [header, claims, signature] = token.split("."); const input = Buffer.from(`${header}.${claims}`);
    expect(verify(null, input, createPublicKey({ key: issuer.publicJwk, format: "jwk" }), Buffer.from(signature, "base64url"))).toBe(true);
    expect(verify(null, input, createPublicKey({ key: maya.publicJwk, format: "jwk" }), Buffer.from(signature, "base64url"))).toBe(false);
    expect(JSON.parse(Buffer.from(claims, "base64url").toString()).cnf.jkt).toBe(pec78JwkThumbprint(maya.publicJwk));
  });

  it("rejects configuration that reuses Maya's proof key as issuer", () => {
    const maya = pair();
    expect(() => issuePec78AccessToken({ env: { PEC78_ISSUER_PRIVATE_JWK: JSON.stringify(maya.privateJwk), PEC78_ISSUER_PUBLIC_JWK: JSON.stringify(maya.publicJwk), PEC78_MAYA_PUBLIC_JWK: JSON.stringify(maya.publicJwk) }, capability: "email.send.admin", credentialId: crypto.randomUUID(), runtimeInstanceId: crypto.randomUUID(), proofThumbprint: pec78JwkThumbprint(maya.publicJwk) })).toThrow("issuer_unavailable");
  });
});

describe("PEC-78 public request binding", () => {
  it("accepts a proof bound to the canonical HTTPS URL behind an internal HTTP reverse proxy", async () => {
    const maya = pair();
    const publicUrl = "https://cc.proexteriorsus.net/api/agent/runtime/v1/token";
    const request = tokenRequest("http://command-center:4321/api/agent/runtime/v1/token", publicUrl, maya.privateJwk);
    const result = await verifyPec78TokenProof(request, {
      PEC78_MAYA_PUBLIC_JWK: JSON.stringify(maya.publicJwk),
      PEC78_MAYA_JWK_THUMBPRINT: pec78JwkThumbprint(maya.publicJwk),
    });
    expect(result.ok).toBe(true);
  });

  it("rejects a proof bound to a different public origin", async () => {
    const maya = pair();
    const request = tokenRequest("http://command-center:4321/api/agent/runtime/v1/token", "https://attacker.example/api/agent/runtime/v1/token", maya.privateJwk);
    const result = await verifyPec78TokenProof(request, {
      PEC78_MAYA_PUBLIC_JWK: JSON.stringify(maya.publicJwk),
      PEC78_MAYA_JWK_THUMBPRINT: pec78JwkThumbprint(maya.publicJwk),
    });
    expect(result).toEqual({ ok: false, status: 401, code: "invalid_proof" });
  });
});
