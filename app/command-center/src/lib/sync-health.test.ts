import {describe,it,expect,vi} from "vitest";
import {sendSyncHealthEvent,SYNC_SENTRY_URL} from "./sync-health";
const e={event_id:"10000000-0000-4000-8000-000000000001",component_key:"cron:test",failures:1,failure_code:"scheduler_error",incident_id:"test"};
describe("sync health relay",()=>{
 it("sends a valid envelope to the pinned destination with a deterministic event ID",async()=>{
  const fn=vi.fn().mockResolvedValue(new Response("{}",{status:200}));
  expect(await sendSyncHealthEvent({...e,untrusted:"sensitive"} as typeof e,fn)).toBe(true);
  expect(fn.mock.calls[0][0]).toBe(SYNC_SENTRY_URL);
  const parts=fn.mock.calls[0][1].body.split("\n");
  expect(JSON.parse(parts[2]).event_id).toBe(e.event_id.replaceAll("-",""));
  expect(parts[2]).not.toContain("sensitive");
 });
 it("keeps failed deliveries pending",async()=>{
  expect(await sendSyncHealthEvent(e,vi.fn().mockResolvedValue(new Response("",{status:429})))).toBe(false);
  expect(await sendSyncHealthEvent(e,vi.fn().mockRejectedValue(new Error("network")))).toBe(false);
 });
});
