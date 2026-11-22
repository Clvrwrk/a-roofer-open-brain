// Presence flags for the QuickBooks mirror (mig 348): pure helpers in mirror-backfill.mjs.
// Run: node --test scripts/tests/qbo-mirror-presence.test.mjs
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  cdcChangedSince,
  missingFlagVerdict,
  splitCdcEntities,
} from "../../integrations/bridges/quickbooks/mirror-backfill.mjs";

const DAY = 24 * 3600 * 1000;

test("a complete, ordered pull may flag missing rows", () => {
  assert.equal(missingFlagVerdict({ complete: true, orderByFallback: false, fetched: 2213, activeBefore: 2436 }), null);
});

test("a pull cut short by --max-pages never flags", () => {
  assert.match(missingFlagVerdict({ complete: false, orderByFallback: false, fetched: 300, activeBefore: 2436 }), /truncated/);
});

test("unordered paging never flags", () => {
  assert.match(missingFlagVerdict({ complete: true, orderByFallback: true, fetched: 2436, activeBefore: 2436 }), /unordered/);
});

test("a pull far smaller than the mirror is treated as a bad response, not mass deletion", () => {
  assert.match(
    missingFlagVerdict({ complete: true, orderByFallback: false, fetched: 100, activeBefore: 2436, missingGuard: 0.8 }),
    /100 of 2436/,
  );
});

test("an empty mirror table does not trip the guard", () => {
  assert.equal(missingFlagVerdict({ complete: true, orderByFallback: false, fetched: 0, activeBefore: 0 }), null);
});

test("CDC starts from the prior watermark minus an overlap", () => {
  const now = Date.parse("2026-11-22T12:00:00Z");
  assert.equal(cdcChangedSince("2026-11-22T02:00:00.000Z", now), "2026-11-22T01:50:00.000Z");
});

test("CDC never asks for more than QuickBooks keeps (30 days)", () => {
  const now = Date.parse("2026-11-22T12:00:00Z");
  const since = Date.parse(cdcChangedSince("2026-08-01T00:00:00Z", now));
  assert.ok(now - since < 30 * DAY);
  assert.ok(now - since > 29 * DAY);
  assert.equal(cdcChangedSince(null, now), cdcChangedSince("not a date", now));
});

test("CDC response splits into live entities and deletions", () => {
  const data = {
    CDCResponse: [
      {
        QueryResponse: [
          {
            Invoice: [
              { Id: "101", SyncToken: "3", Balance: 50, MetaData: { LastUpdatedTime: "2026-11-21T08:00:00-08:00" } },
              { domain: "QBO", status: "Deleted", Id: "102", MetaData: { LastUpdatedTime: "2026-11-21T09:00:00-08:00" } },
            ],
          },
          { Payment: [{ Id: "7" }] },
        ],
      },
    ],
  };
  const { live, removed } = splitCdcEntities(data, "Invoice");
  assert.deepEqual(live.map((e) => e.Id), ["101"]);
  assert.deepEqual(removed, [{ id: "102", deleted_at: "2026-11-21T09:00:00-08:00" }]);
  assert.deepEqual(splitCdcEntities({}, "Invoice"), { live: [], removed: [] });
});
