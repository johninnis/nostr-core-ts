import { assertEquals } from "@std/assert"
import {
  serialiseAuthMessage,
  serialiseCloseMessage,
  serialiseEventMessage,
  serialiseReqMessage,
} from "../../src/domain/service/client-message.ts"
import type { NostrEvent } from "../../src/domain/value-object/nostr-event.ts"
import { parseEventId } from "../../src/domain/value-object/event-id.ts"
import { parsePublicKey } from "../../src/domain/value-object/public-key.ts"
import { parseSig } from "../../src/domain/value-object/sig.ts"

const event: NostrEvent = {
  id: parseEventId("a".repeat(64)),
  pubkey: parsePublicKey("b".repeat(64)),
  kind: 1,
  created_at: 1000,
  tags: [],
  content: "hello",
  sig: parseSig("c".repeat(128)),
}

Deno.test("serialiseReqMessage - emits REQ with the subscription id and spread filters", () => {
  const wire = serialiseReqMessage("sub-1", [{ kinds: [1] }, { authors: [parsePublicKey("d".repeat(64))] }])
  assertEquals(JSON.parse(wire), ["REQ", "sub-1", { kinds: [1] }, { authors: ["d".repeat(64)] }])
})

Deno.test("serialiseReqMessage - emits REQ with no filters when none are supplied", () => {
  assertEquals(JSON.parse(serialiseReqMessage("sub-1", [])), ["REQ", "sub-1"])
})

Deno.test("serialiseEventMessage - emits EVENT with the signed event", () => {
  assertEquals(JSON.parse(serialiseEventMessage(event)), ["EVENT", event])
})

Deno.test("serialiseCloseMessage - emits CLOSE with the subscription id", () => {
  assertEquals(JSON.parse(serialiseCloseMessage("sub-1")), ["CLOSE", "sub-1"])
})

Deno.test("serialiseAuthMessage - emits AUTH with the signed challenge event", () => {
  assertEquals(JSON.parse(serialiseAuthMessage(event)), ["AUTH", event])
})
