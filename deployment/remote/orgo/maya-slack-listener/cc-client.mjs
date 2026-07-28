import { createHash, createPrivateKey, randomUUID, sign } from "node:crypto";

export const COMMAND_CENTER_ORIGIN = "https://cc.proexteriorsus.net";
export const CONTRACT_VERSION = "pec78-runtime-authorization-v1";

function encode(value) {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

function digest(value) {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}

function dpop({ privateJwk, url, body, accessToken }) {
  const header = encode({ alg: "EdDSA", typ: "dpop+jwt" });
  const claims = {
    htm: "POST",
    htu: url,
    body_sha256: digest(body),
    iat: Math.floor(Date.now() / 1_000),
    jti: randomUUID(),
  };
  if (accessToken) claims.ath = createHash("sha256").update(accessToken).digest("base64url");
  const payload = encode(claims);
  const input = `${header}.${payload}`;
  const key = createPrivateKey({ key: privateJwk, format: "jwk" });
  return `${input}.${sign(null, Buffer.from(input), key).toString("base64url")}`;
}

async function post(url, body, headers, fetchImpl, timeoutMs = 30_000) {
  const response = await fetchImpl(url, {
    method: "POST",
    headers: { "content-type": "application/json", "x-pec78-contract": CONTRACT_VERSION, ...headers },
    body,
    redirect: "error",
    signal: AbortSignal.timeout(timeoutMs),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`Command Center denied request: ${response.status}:${String(result?.status ?? "unknown")}`);
  return result;
}

export function createPec78Client({ privateJwk, credentialId, runtimeInstanceId, fetchImpl = fetch }) {
  if (!privateJwk || privateJwk.kty !== "OKP" || privateJwk.crv !== "Ed25519" || !privateJwk.d) throw new Error("Invalid Maya DPoP private key");
  if (!/^[0-9a-f-]{36}$/i.test(credentialId) || !/^[0-9a-f-]{36}$/i.test(runtimeInstanceId)) throw new Error("Invalid PEC-78 runtime identity");

  return Object.freeze({
    async request(capability, pathname, payload, idempotencyKey = randomUUID()) {
      const tokenUrl = `${COMMAND_CENTER_ORIGIN}/api/agent/runtime/v1/token`;
      const tokenBody = JSON.stringify({ capability, credentialId, runtimeInstanceId });
      const tokenResult = await post(tokenUrl, tokenBody, { dpop: dpop({ privateJwk, url: tokenUrl, body: tokenBody }) }, fetchImpl);
      const accessToken = tokenResult?.accessToken;
      if (tokenResult?.tokenType !== "DPoP" || typeof accessToken !== "string") throw new Error("Command Center returned an invalid access token");
      const url = `${COMMAND_CENTER_ORIGIN}${pathname}`;
      const body = JSON.stringify(payload);
      return post(url, body, {
        authorization: `DPoP ${accessToken}`,
        dpop: dpop({ privateJwk, url, body, accessToken }),
        "idempotency-key": idempotencyKey,
      }, fetchImpl);
    },
  });
}
