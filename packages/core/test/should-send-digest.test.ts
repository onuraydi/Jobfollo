import { describe, expect, it } from "vitest";
import {
  isValidTimeOfDay,
  shouldSendDigest,
  type ShouldSendDigestInput,
  type ShouldSendDigestResult,
} from "../src/index.js";

function baseInput(
  overrides: Partial<ShouldSendDigestInput> = {},
): ShouldSendDigestInput {
  return {
    enabled: true,
    today: "2026-03-10",
    nowTime: "09:00",
    sendTime: "09:00",
    alreadySentToday: false,
    failureCountToday: 0,
    digest: { isEmpty: false },
    ...overrides,
  };
}

describe("isValidTimeOfDay", () => {
  it.each([
    ["00:00", true],
    ["09:05", true],
    ["12:30", true],
    ["23:59", true],
    ["9:00", false],
    ["09:5", false],
    ["24:00", false],
    ["23:60", false],
    ["-01:00", false],
    ["09:00:00", false],
    ["", false],
    ["ab:cd", false],
  ])("isValidTimeOfDay(%j) === %s", (value, expected) => {
    expect(isValidTimeOfDay(value)).toBe(expected);
  });
});

describe("shouldSendDigest", () => {
  const cases: Array<[string, Partial<ShouldSendDigestInput>, ShouldSendDigestResult]> = [
    ["sends at exact configured sendTime", { nowTime: "09:00", sendTime: "09:00" }, { send: true }],
    ["sends after sendTime (catch-up on launch/resume)", { nowTime: "14:35", sendTime: "09:00" }, { send: true }],
    ["skips one minute before sendTime", { nowTime: "08:59", sendTime: "09:00" }, { send: false, reason: "before_send_time" }],
    ["handles midnight boundary 00:00 sendTime", { nowTime: "00:00", sendTime: "00:00" }, { send: true }],
    ["handles end-of-day boundary 23:59", { nowTime: "23:58", sendTime: "23:59" }, { send: false, reason: "before_send_time" }],
    ["handles end-of-day exact 23:59", { nowTime: "23:59", sendTime: "23:59" }, { send: true }],
    ["allows leap day 2028-02-29", { today: "2028-02-29" }, { send: true }],
    ["rejects non-leap 2026-02-29 as invalid_date", { today: "2026-02-29" }, { send: false, reason: "invalid_date" }],
    ["rejects invalid nowTime", { nowTime: "24:00" }, { send: false, reason: "invalid_time" }],
    ["rejects invalid sendTime", { sendTime: "9:00" }, { send: false, reason: "invalid_time" }],
    ["skips when disabled regardless of other flags", { enabled: false, today: "bad", nowTime: "bad" }, { send: false, reason: "disabled" }],
    ["skips when already sent today", { alreadySentToday: true }, { send: false, reason: "already_sent" }],
    ["allows retry on 1st failure", { failureCountToday: 1 }, { send: true }],
    ["allows retry on 2nd failure", { failureCountToday: 2 }, { send: true }],
    ["stops on 3rd failure (default maxAttemptsPerDay=3)", { failureCountToday: 3 }, { send: false, reason: "max_attempts_reached" }],
    ["stops above maxAttemptsPerDay", { failureCountToday: 5 }, { send: false, reason: "max_attempts_reached" }],
    ["respects custom maxAttemptsPerDay", { failureCountToday: 3, maxAttemptsPerDay: 5 }, { send: true }],
    ["stops when maxAttemptsPerDay is 0", { failureCountToday: 0, maxAttemptsPerDay: 0 }, { send: false, reason: "max_attempts_reached" }],
    ["skips empty digest by default", { digest: { isEmpty: true } }, { send: false, reason: "empty_digest" }],
    ["sends empty digest when sendIfEmpty is true", { digest: { isEmpty: true }, sendIfEmpty: true }, { send: true }],
    [
      "prioritizes already_sent over before_send_time and empty_digest",
      { alreadySentToday: true, nowTime: "07:00", sendTime: "09:00", digest: { isEmpty: true } },
      { send: false, reason: "already_sent" },
    ],
    [
      "prioritizes max_attempts_reached over before_send_time",
      { failureCountToday: 3, nowTime: "07:00", sendTime: "09:00" },
      { send: false, reason: "max_attempts_reached" },
    ],
  ];

  it.each(cases)("%s", (_label, overrides, expected) => {
    expect(shouldSendDigest(baseInput(overrides))).toEqual(expected);
  });

  it("does not mutate input objects", () => {
    const input = Object.freeze(baseInput({ digest: Object.freeze({ isEmpty: false }) }));
    expect(shouldSendDigest(input)).toEqual({ send: true });
  });
});
