import { createPrivateKey, createPublicKey, sign } from "node:crypto";
import { readFile } from "node:fs/promises";

async function loadPrivateJwk(envFile) {
  if (!envFile) throw new Error("env_path_required");
  const lines = (await readFile(envFile, "utf8")).split(/\r?\n/);
  const matches = lines.filter((line) => line.startsWith("PEC78_MAYA_PRIVATE_JWK="));
  if (matches.length !== 1) throw new Error("jwk_assignment_count");
  const raw = matches[0].slice(matches[0].indexOf("=") + 1);
  const jwk = JSON.parse(raw);
  if (!jwk || Array.isArray(jwk) || Object.getPrototypeOf(jwk) !== Object.prototype) throw new Error("jwk_object_required");
  if (JSON.stringify(jwk) !== raw) throw new Error("jwk_compact_form");
  if (Object.keys(jwk).sort().join(",") !== "crv,d,kty,x" || jwk.kty !== "OKP" || jwk.crv !== "Ed25519" ||
      typeof jwk.d !== "string" || typeof jwk.x !== "string") throw new Error("jwk_shape");
  const privateKey = createPrivateKey({ key: jwk, format: "jwk" });
  if (privateKey.asymmetricKeyType !== "ed25519") throw new Error("jwk_key_type");
  const derived = createPublicKey(privateKey).export({ format: "jwk" });
  if (derived.kty !== jwk.kty || derived.crv !== jwk.crv || derived.x !== jwk.x) throw new Error("jwk_public_mismatch");
  sign(null, Buffer.from("pec78-loader-preflight-v1"), privateKey);
  return raw;
}

try {
  process.stdout.write(await loadPrivateJwk(process.argv[2]));
} catch {
  process.exitCode = 1;
}
