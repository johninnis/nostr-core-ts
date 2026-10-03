import { assertEquals } from "@std/assert"
import { parseReasonPrefix, parseRelayMessage } from "../../src/domain/service/relay-message.ts"
import { authChallengeFixture, eventIdFixture, subscriptionIdFixture } from "../../testing.ts"

const validEvent = {
  id: "a".repeat(64),
  pubkey: "b".repeat(64),
  created_at: 1700000000,
  kind: 1,
  tags: [],
  content: "hello",
  sig: "c".repeat(128),
}
const eventIdHex = "d".repeat(64)
const eventId = eventIdFixture(eventIdHex)

Deno.test("parseRelayMessage - EVENT carries the subscription id and validated event", () => {
  const msg = parseRelayMessage(JSON.stringify(["EVENT", "sub-1", validEvent]))
  if (msg?.type !== "EVENT") throw new Error("expected EVENT")
  assertEquals(msg.subscriptionId, "sub-1")
  assertEquals(msg.event.id, validEvent.id)
})

Deno.test("parseRelayMessage - EVENT is null when the subscription id is not a string", () => {
  assertEquals(parseRelayMessage(JSON.stringify(["EVENT", 1, validEvent])), null)
})

Deno.test("parseRelayMessage - EVENT is null when the event payload is invalid", () => {
  assertEquals(parseRelayMessage(JSON.stringify(["EVENT", "sub-1", { id: "nope" }])), null)
})

Deno.test("parseRelayMessage - EOSE carries the subscription id", () => {
  assertEquals(parseRelayMessage(JSON.stringify(["EOSE", "sub-1"])), {
    type: "EOSE",
    subscriptionId: subscriptionIdFixture("sub-1"),
  })
})

Deno.test("parseRelayMessage - EOSE is null when the subscription id is not a string", () => {
  assertEquals(parseRelayMessage(JSON.stringify(["EOSE", 7])), null)
})

Deno.test("parseRelayMessage - OK brands the event id and carries the message and its reason prefix", () => {
  assertEquals(parseRelayMessage(JSON.stringify(["OK", eventIdHex, true, "duplicate: already have it"])), {
    type: "OK",
    eventId,
    accepted: true,
    message: "duplicate: already have it",
    reason: "duplicate",
  })
})

Deno.test("parseRelayMessage - OK with an empty message has no reason prefix", () => {
  assertEquals(parseRelayMessage(JSON.stringify(["OK", eventIdHex, true, ""])), {
    type: "OK",
    eventId,
    accepted: true,
    message: "",
    reason: null,
  })
})

Deno.test("parseRelayMessage - OK false without a prefix is an error, the NIP-01 prefix for when none fits", () => {
  assertEquals(parseRelayMessage(JSON.stringify(["OK", eventIdHex, false, "you are banned"])), {
    type: "OK",
    eventId,
    accepted: false,
    message: "you are banned",
    reason: "error",
  })
})

Deno.test("parseRelayMessage - OK false with a prefix NIP-01 does not standardise is an error", () => {
  const msg = parseRelayMessage(JSON.stringify(["OK", eventIdHex, false, "unsupported: kind 4"]))
  assertEquals(msg?.type === "OK" ? [msg.reason, msg.message] : null, ["error", "unsupported: kind 4"])
})

Deno.test("parseRelayMessage - OK true without a prefix has no reason", () => {
  const msg = parseRelayMessage(JSON.stringify(["OK", eventIdHex, true, "saved"]))
  assertEquals(msg?.type === "OK" ? msg.reason : undefined, null)
})

Deno.test("parseRelayMessage - OK is null without its message, which NIP-01 says MUST always be present", () => {
  assertEquals(parseRelayMessage(JSON.stringify(["OK", eventIdHex, false])), null)
})

Deno.test("parseRelayMessage - OK is null when the event id is not a valid event id", () => {
  assertEquals(parseRelayMessage(JSON.stringify(["OK", "not-hex", true, ""])), null)
})

Deno.test("parseRelayMessage - OK is null when the accepted flag is not a boolean", () => {
  assertEquals(parseRelayMessage(JSON.stringify(["OK", eventId, "true", ""])), null)
})

Deno.test("parseRelayMessage - CLOSED carries the subscription id, message and reason prefix", () => {
  assertEquals(parseRelayMessage(JSON.stringify(["CLOSED", "sub-1", "auth-required: x"])), {
    type: "CLOSED",
    subscriptionId: subscriptionIdFixture("sub-1"),
    message: "auth-required: x",
    reason: "auth-required",
  })
})

Deno.test("parseRelayMessage - CLOSED without a prefix keeps its message and is an error", () => {
  assertEquals(parseRelayMessage(JSON.stringify(["CLOSED", "sub-1", "shutting down"])), {
    type: "CLOSED",
    subscriptionId: subscriptionIdFixture("sub-1"),
    message: "shutting down",
    reason: "error",
  })
})

Deno.test("parseRelayMessage - CLOSED with a prefix NIP-01 does not standardise is an error", () => {
  const msg = parseRelayMessage(JSON.stringify(["CLOSED", "sub-1", "unsupported: filter contains unknown elements"]))
  assertEquals(msg?.type === "CLOSED" ? msg.reason : null, "error")
})

Deno.test("parseRelayMessage - CLOSED is null without its message", () => {
  assertEquals(parseRelayMessage(JSON.stringify(["CLOSED", "sub-1"])), null)
})

Deno.test("parseRelayMessage - CLOSED is null when the subscription id is not a string", () => {
  assertEquals(parseRelayMessage(JSON.stringify(["CLOSED", null])), null)
})

Deno.test("parseRelayMessage - NOTICE carries the message", () => {
  assertEquals(parseRelayMessage(JSON.stringify(["NOTICE", "rate limited"])), {
    type: "NOTICE",
    message: "rate limited",
  })
})

Deno.test("parseRelayMessage - NOTICE is null when the message is not a string", () => {
  assertEquals(parseRelayMessage(JSON.stringify(["NOTICE", 42])), null)
})

Deno.test("parseRelayMessage - NOTICE is null when the message is empty (shared ADR-0099)", () => {
  assertEquals(parseRelayMessage(JSON.stringify(["NOTICE", ""])), null)
})

Deno.test("parseRelayMessage - AUTH carries the challenge", () => {
  assertEquals(parseRelayMessage(JSON.stringify(["AUTH", "challenge-string"])), {
    type: "AUTH",
    challenge: authChallengeFixture("challenge-string"),
  })
})

Deno.test("parseRelayMessage - AUTH is null for an empty challenge", () => {
  assertEquals(parseRelayMessage(JSON.stringify(["AUTH", ""])), null)
})

Deno.test("parseRelayMessage - AUTH is null when the challenge is not a string", () => {
  assertEquals(parseRelayMessage(JSON.stringify(["AUTH", false])), null)
})

Deno.test("parseRelayMessage - COUNT carries the subscription id and an exact count", () => {
  assertEquals(parseRelayMessage(JSON.stringify(["COUNT", "sub-1", { count: 42 }])), {
    type: "COUNT",
    subscriptionId: subscriptionIdFixture("sub-1"),
    count: 42,
    approximate: false,
  })
})

Deno.test("parseRelayMessage - COUNT preserves NIP-45's approximate flag", () => {
  assertEquals(parseRelayMessage(JSON.stringify(["COUNT", "sub-1", { count: 42, approximate: true }])), {
    type: "COUNT",
    subscriptionId: subscriptionIdFixture("sub-1"),
    count: 42,
    approximate: true,
  })
})

Deno.test("parseRelayMessage - COUNT is null for a negative or fractional count", () => {
  assertEquals(parseRelayMessage(JSON.stringify(["COUNT", "sub-1", { count: -1 }])), null)
  assertEquals(parseRelayMessage(JSON.stringify(["COUNT", "sub-1", { count: 1.5 }])), null)
})

Deno.test("parseRelayMessage - COUNT reads a count up to 2^53 - 1 and refuses one above it (shared ADR-0098)", () => {
  const countOf = (count: string) => parseRelayMessage(`["COUNT","sub-1",{"count":${count}}]`)
  assertEquals(countOf("9007199254740991")?.type, "COUNT")
  assertEquals(countOf("9007199254740992"), null)
  assertEquals(countOf("9223372036854775807"), null)
})

Deno.test("parseRelayMessage - COUNT reads a null or false approximate as an exact count (shared ADR-0089)", () => {
  const exact = { type: "COUNT", subscriptionId: subscriptionIdFixture("sub-1"), count: 1, approximate: false }
  assertEquals([
    parseRelayMessage(JSON.stringify(["COUNT", "sub-1", { count: 1, approximate: null }])),
    parseRelayMessage(JSON.stringify(["COUNT", "sub-1", { count: 1, approximate: false }])),
  ], [exact, exact])
})

Deno.test("parseRelayMessage - COUNT is null when approximate is not a boolean", () => {
  assertEquals(parseRelayMessage(JSON.stringify(["COUNT", "sub-1", { count: 1, approximate: "yes" }])), null)
})

Deno.test("parseRelayMessage - COUNT is null when the subscription id is not a string", () => {
  assertEquals(parseRelayMessage(JSON.stringify(["COUNT", 1, { count: 42 }])), null)
})

Deno.test("parseRelayMessage - COUNT is null when the payload is not a record", () => {
  assertEquals(parseRelayMessage(JSON.stringify(["COUNT", "sub-1", 42])), null)
})

Deno.test("parseRelayMessage - COUNT is null when count is not a number", () => {
  assertEquals(parseRelayMessage(JSON.stringify(["COUNT", "sub-1", { count: "lots" }])), null)
})

Deno.test("parseRelayMessage - null for invalid JSON", () => {
  assertEquals(parseRelayMessage("{not json"), null)
})

Deno.test("parseRelayMessage - null for a non-array payload", () => {
  assertEquals(parseRelayMessage(JSON.stringify({ type: "EVENT" })), null)
})

Deno.test("parseRelayMessage - null for an unknown verb", () => {
  assertEquals(parseRelayMessage(JSON.stringify(["BOGUS", "sub-1"])), null)
})

Deno.test("parseRelayMessage - a subscription id must be non-empty (NIP-01)", () => {
  assertEquals(parseRelayMessage(JSON.stringify(["EOSE", ""])), null)
})

Deno.test("parseRelayMessage - a subscription id may be at most 64 characters (NIP-01)", () => {
  assertEquals(parseRelayMessage(JSON.stringify(["EOSE", "s".repeat(64)])), {
    type: "EOSE",
    subscriptionId: subscriptionIdFixture("s".repeat(64)),
  })
  assertEquals(parseRelayMessage(JSON.stringify(["EOSE", "s".repeat(65)])), null)
  assertEquals(parseRelayMessage(JSON.stringify(["CLOSED", "s".repeat(65), "error: x"])), null)
  assertEquals(parseRelayMessage(JSON.stringify(["COUNT", "s".repeat(65), { count: 1 }])), null)
})

Deno.test("parseRelayMessage - a subscription id counts characters, not UTF-16 units", () => {
  const id = "🦄".repeat(64)
  assertEquals(parseRelayMessage(JSON.stringify(["EOSE", id])), {
    type: "EOSE",
    subscriptionId: subscriptionIdFixture(id),
  })
})

Deno.test("parseReasonPrefix - reads each machine-readable prefix NIP-01 and NIP-42 define", () => {
  const prefixes = [
    "duplicate",
    "pow",
    "blocked",
    "rate-limited",
    "invalid",
    "restricted",
    "mute",
    "error",
    "auth-required",
  ] as const
  assertEquals(prefixes.map((prefix) => parseReasonPrefix(`${prefix}: detail`)), [...prefixes])
})

Deno.test("parseReasonPrefix - null for a message without a known prefix", () => {
  assertEquals([parseReasonPrefix(""), parseReasonPrefix("nope: x"), parseReasonPrefix("blocked")], [null, null, null])
})

const RELAY_MESSAGES_WITH_TRAILING_ELEMENTS: ReadonlyArray<readonly [string, ReadonlyArray<unknown>]> = [
  ["EVENT", ["EVENT", "sub-1", validEvent, "extra"]],
  ["OK", ["OK", eventIdHex, true, "", "extra"]],
  ["EOSE", ["EOSE", "sub-1", "extra"]],
  ["CLOSED", ["CLOSED", "sub-1", "error: gone", "extra"]],
  ["NOTICE", ["NOTICE", "hello", "extra"]],
  ["AUTH", ["AUTH", "challenge", "extra"]],
  ["COUNT", ["COUNT", "sub-1", { count: 1 }, "extra"]],
]

for (const [verb, message] of RELAY_MESSAGES_WITH_TRAILING_ELEMENTS) {
  Deno.test(`parseRelayMessage - ${verb} ignores elements after the ones it defines (shared ADR-0091)`, () => {
    assertEquals(parseRelayMessage(JSON.stringify(message))?.type, verb)
  })
}

const RELAY_MESSAGES_MISSING_AN_ELEMENT: ReadonlyArray<readonly [string, ReadonlyArray<unknown>]> = [
  ["EVENT", ["EVENT", "sub-1"]],
  ["OK", ["OK", eventIdHex, true]],
  ["EOSE", ["EOSE"]],
  ["CLOSED", ["CLOSED", "sub-1"]],
  ["NOTICE", ["NOTICE"]],
  ["AUTH", ["AUTH"]],
  ["COUNT", ["COUNT", "sub-1"]],
]

for (const [verb, message] of RELAY_MESSAGES_MISSING_AN_ELEMENT) {
  Deno.test(`parseRelayMessage - ${verb} missing an element it defines is null (shared ADR-0091)`, () => {
    assertEquals(parseRelayMessage(JSON.stringify(message)), null)
  })
}

Deno.test("parseRelayMessage - reads an integer written with a fraction as that integer, which JSON.parse cannot tell apart (shared ADR-0098)", () => {
  const count = parseRelayMessage('["COUNT","sub-1",{"count":3.0}]')
  const event = parseRelayMessage(`["EVENT","sub-1",${JSON.stringify(validEvent).replace('"kind":1', '"kind":1.0')}]`)
  assertEquals([count?.type === "COUNT" && count.count, event?.type === "EVENT" && event.event.kind], [3, 1])
})

Deno.test("parseRelayMessage - refuses an EVENT whose content holds an escaped unpaired surrogate (shared ADR-0104)", () => {
  const wire = JSON.stringify(["EVENT", "sub", { ...validEvent, content: "x" }]).replace(
    '"content":"x"',
    '"content":"\\ud800"',
  )
  assertEquals(parseRelayMessage(wire), null)
})
