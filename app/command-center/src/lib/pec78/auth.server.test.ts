import { createPublicKey, generateKeyPairSync, verify } from "node:crypto";
import { describe, expect, it } from "vitest";
import { issuePec78AccessToken, pec78JwkThumbprint } from "./auth.server";

function pair() {
  const { privateKey, publicKey } = generateKeyPairSync("ed25519");
  return {
    privateJwk: privateKey.export({ format: "jwk" }),
    publicJwk: publicKey.export({ format: "jwk" }),
  };
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
