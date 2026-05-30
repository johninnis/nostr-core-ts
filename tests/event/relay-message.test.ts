import { assertEquals } from "@std/assert"
import { parseRelayMessage } from "../../src/domain/service/relay-message.ts"
import { parseEventId } from "../../src/domain/value-object/event-id.ts"

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
const eventId = parseEventId(eventIdHex)

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
  assertEquals(parseRelayMessage(JSON.stringify(["EOSE", "sub-1"])), { type: "EOSE", subscriptionId: "sub-1" })
})

Deno.test("parseRelayMessage - EOSE is null when the subscription id is not a string", () => {
  assertEquals(parseRelayMessage(JSON.stringify(["EOSE", 7])), null)
})

Deno.test("parseRelayMessage - OK brands the event id and carries the reason", () => {
  assertEquals(parseRelayMessage(JSON.stringify(["OK", eventIdHex, true, "duplicate"])), {
    type: "OK",
    eventId,
    accepted: true,
    message: "duplicate",
  })
})

Deno.test("parseRelayMessage - OK defaults a missing reason to an empty string", () => {
  assertEquals(parseRelayMessage(JSON.stringify(["OK", eventIdHex, false])), {
    type: "OK",
    eventId,
    accepted: false,
    message: "",
  })
})

Deno.test("parseRelayMessage - OK is null when the event id is not a valid event id", () => {
  assertEquals(parseRelayMessage(JSON.stringify(["OK", "not-hex", true, ""])), null)
})

Deno.test("parseRelayMessage - OK is null when the accepted flag is not a boolean", () => {
  assertEquals(parseRelayMessage(JSON.stringify(["OK", eventId, "true", ""])), null)
})

Deno.test("parseRelayMessage - CLOSED carries the subscription id and reason", () => {
  assertEquals(parseRelayMessage(JSON.stringify(["CLOSED", "sub-1", "auth-required: x"])), {
    type: "CLOSED",
    subscriptionId: "sub-1",
    message: "auth-required: x",
  })
})

Deno.test("parseRelayMessage - CLOSED defaults a missing reason to an empty string", () => {
  assertEquals(parseRelayMessage(JSON.stringify(["CLOSED", "sub-1"])), {
    type: "CLOSED",
    subscriptionId: "sub-1",
    message: "",
  })
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

Deno.test("parseRelayMessage - AUTH carries the challenge", () => {
  assertEquals(parseRelayMessage(JSON.stringify(["AUTH", "challenge-string"])), {
    type: "AUTH",
    challenge: "challenge-string",
  })
})

Deno.test("parseRelayMessage - AUTH is null when the challenge is not a string", () => {
  assertEquals(parseRelayMessage(JSON.stringify(["AUTH", false])), null)
})

Deno.test("parseRelayMessage - COUNT carries the subscription id and count", () => {
  assertEquals(parseRelayMessage(JSON.stringify(["COUNT", "sub-1", { count: 42 }])), {
    type: "COUNT",
    subscriptionId: "sub-1",
    count: 42,
  })
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
