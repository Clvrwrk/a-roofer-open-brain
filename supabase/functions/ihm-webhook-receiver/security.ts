// Pure authentication contract; no credentials or database access.
export async function verifySignature(body: string, signature: string, secret: string): Promise<boolean> {
  if (!secret || !signature) return false;
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(body.trim()));
  const hexHash = Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  if (hexHash.length !== signature.length) return false;
  let result = 0;
  for (let i = 0; i < hexHash.length; i++) {
    result |= hexHash.charCodeAt(i) ^ signature.charCodeAt(i);
  }
  return result === 0;
}
