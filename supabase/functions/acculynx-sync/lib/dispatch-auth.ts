// A gateway JWT is not scheduler authorization. Each invocation also needs a
// short-lived, single-use capability issued by the protected database trigger.
export async function authorizeDispatch(req: Request, sb: any): Promise<Response | {runId: string; body: Record<string, any>}> {
  const deny = (status: number) => new Response(JSON.stringify({error:status===503 ? "authorization_unavailable" : "unauthorized"}), {status,headers:{"Content-Type":"application/json"}});
  const token = req.headers.get("x-sync-token") ?? "";
  if (!/^[a-f0-9]{64}$/.test(token)) return deny(401);
  let input: any;
  try { input = await req.json(); } catch { return deny(401); }
  const runId = input?.dispatch_run_id;
  if (typeof runId !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(runId)) return deny(401);
  try {
    const {data,error} = await sb.rpc("claim_acculynx_sync_run", {p_run_id:runId,p_token:token});
    if (error) return deny(503);
    if (!data?.body) return deny(401);
    return {runId,body:data.body};
  } catch { return deny(503); }
}
