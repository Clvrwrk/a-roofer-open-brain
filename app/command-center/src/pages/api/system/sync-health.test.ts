import {beforeEach,expect,it,vi} from "vitest";
const client=vi.hoisted(()=>({create:vi.fn()}));
vi.mock("@lib/supabase.server",()=>({createServerSupabaseClient:client.create}));
vi.mock("@sentry/astro",()=>({captureException:vi.fn()}));
vi.mock("@lib/runtime-status",()=>({loadRuntimeBoard:vi.fn().mockResolvedValue({groups:[]})}));
import {POST} from "./sync-health";
beforeEach(()=>vi.clearAllMocks());
for(const actor of [undefined,{type:"human",id:"ob-auditor"},{type:"service_agent",id:"ob-researcher"}]) {
 it(`rejects ${actor?.type??"anonymous"} before privileged reads`,async()=>{
  const response=await POST({locals:{actor}} as any);
  expect(response.status).toBe(403);expect(client.create).not.toHaveBeenCalled();
 });
}
