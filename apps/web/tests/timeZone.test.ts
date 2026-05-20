import assert from "node:assert/strict";
import test from "node:test";

import {
  APP_TIME_ZONE,
  formatHoChiMinhDatetimeLocal,
  parseHoChiMinhDatetimeLocal,
} from "../lib/timeZone";
import { parseContestDeadline } from "../app/api/contests/validation";

test("Ho Chi Minh timezone constant uses the IANA city timezone", () => {
  assert.equal(APP_TIME_ZONE, "Asia/Ho_Chi_Minh");
});

test("datetime-local values display UTC instants in Ho Chi Minh time", () => {
  assert.equal(
    formatHoChiMinhDatetimeLocal("2026-05-18T01:00:00.000Z"),
    "2026-05-18T08:00"
  );
});

test("datetime-local values are parsed as Ho Chi Minh time", () => {
  const parsed = parseHoChiMinhDatetimeLocal("2026-05-18T08:00");

  assert.equal(parsed?.toISOString(), "2026-05-18T01:00:00.000Z");
});

test("invalid Ho Chi Minh datetime-local values are rejected", () => {
  assert.equal(parseHoChiMinhDatetimeLocal("2026-02-30T08:00"), null);
});

test("contest deadline validation stores Ho Chi Minh input as UTC", () => {
  const result = parseContestDeadline("2026-05-18T08:00");

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.value?.toISOString(), "2026-05-18T01:00:00.000Z");
});
