import { assertEquals, assertThrows } from "@std/assert"
import { InvalidArgumentError } from "../../src/domain/exception/invalid-argument-error.ts"
import {
  serialiseAuthMessage,
  serialiseCloseMessage,
  serialiseEventMessage,
  serialiseReqMessage,
} from "../../src/domain/service/client-message.ts"
import { serialiseEvent } from "../../src/domain/service/event-json.ts"
import type { NostrEvent } from "../../src/domain/value-object/nostr-event.ts"
import type { NostrFilter } from "../../src/domain/value-object/nostr-filter.ts"
import { eventIdFixture, publicKeyFixture, sigFixture, subscriptionIdFixture } from "../../testing.ts"

const SUB = subscriptionIdFixture("sub-1")

const event: NostrEvent = {
  id: eventIdFixture("a".repeat(64)),
  pubkey: publicKeyFixture("b".repeat(64)),
  kind: 1,
  created_at: 1000,
  tags: [],
  content: "hello",
  sig: sigFixture("c".repeat(128)),
}

Deno.test("serialiseReqMessage - emits REQ with the subscription id and spread filters", () => {
  const wire = serialiseReqMessage(SUB, [{ kinds: [1] }, { authors: [publicKeyFixture("d".repeat(64))] }])
  assertEquals(JSON.parse(wire ?? ""), ["REQ", "sub-1", { kinds: [1] }, { authors: ["d".repeat(64)] }])
})

Deno.test("serialiseReqMessage - writes each filter's fields in innis/nostr-core's order, whatever order the caller gave", () => {
  const second = publicKeyFixture("c6047f9441ed7d6d3045406e95c07cd85c778e4b8cef3ca7abac09b95c709ee5")
  const first = publicKeyFixture("79be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798")
  const wire = serialiseReqMessage(SUB, [{
    kinds: [1, 7, 1],
    authors: [second, first],
    "#t": ["b", "a", "é"],
    limit: 0,
  }])
  assertEquals(
    wire,
    `["REQ","sub-1",{"authors":["${second}","${first}"],"kinds":[1,7,1],"#t":["b","a","é"],"limit":0}]`,
  )
})

Deno.test("serialiseReqMessage - writes ids, authors, kinds, tag conditions in the caller's order, since, until, limit, search", () => {
  const wire = serialiseReqMessage(SUB, [{
    search: "q",
    limit: 5,
    until: 20,
    since: 10,
    "#p": [publicKeyFixture("d".repeat(64))],
    "#e": [eventIdFixture("e".repeat(64))],
    kinds: [1],
    authors: [publicKeyFixture("b".repeat(64))],
    ids: [eventIdFixture("a".repeat(64))],
  }])
  assertEquals(
    wire,
    `["REQ","sub-1",{"ids":["${"a".repeat(64)}"],"authors":["${"b".repeat(64)}"],"kinds":[1],"#p":["${
      "d".repeat(64)
    }"],"#e":["${"e".repeat(64)}"],"since":10,"until":20,"limit":5,"search":"q"}]`,
  )
})

Deno.test("serialiseReqMessage - leaves out a key NIP-01 and NIP-50 do not define, as innis/nostr-core does", () => {
  const filter: NostrFilter = JSON.parse('{"extension":true,"kinds":[1]}')
  assertEquals(serialiseReqMessage(SUB, [filter]), `["REQ","sub-1",{"kinds":[1]}]`)
})

Deno.test("serialiseReqMessage - is null when no filters are supplied, since such a REQ selects nothing", () => {
  assertEquals(serialiseReqMessage(SUB, []), null)
})

Deno.test("serialiseReqMessage - leaves out every filter that can match nothing (ADR-0029)", () => {
  const wire = serialiseReqMessage(SUB, [{ kinds: [] }, { kinds: [1] }, { "#t": [] }, { since: 20, until: 10 }])
  assertEquals(JSON.parse(wire ?? ""), ["REQ", "sub-1", { kinds: [1] }])
})

Deno.test("serialiseReqMessage - throws before writing a filter carrying a field forced past NostrFilter as null", () => {
  const forced: NostrFilter = JSON.parse(`{"kinds":[1],"limit":null}`)
  assertThrows(() => serialiseReqMessage(SUB, [forced]), InvalidArgumentError, "limit")
})

Deno.test("serialiseReqMessage - is null when every filter can match nothing", () => {
  assertEquals(serialiseReqMessage(SUB, [{ authors: [] }, { ids: [] }]), null)
})

Deno.test("serialiseEventMessage - emits EVENT with the signed event", () => {
  assertEquals(JSON.parse(serialiseEventMessage(event)), ["EVENT", event])
})

Deno.test("serialiseEventMessage - carries only the event's seven NIP-01 fields, in NIP-01 order", () => {
  const withExtra = { ...event, seenOn: ["wss://relay.example"] }
  assertEquals(serialiseEventMessage(withExtra), `["EVENT",${serialiseEvent(event)}]`)
})

Deno.test("serialiseCloseMessage - emits CLOSE with the subscription id", () => {
  assertEquals(JSON.parse(serialiseCloseMessage(SUB)), ["CLOSE", "sub-1"])
})

Deno.test("serialiseAuthMessage - emits AUTH with the signed challenge event", () => {
  assertEquals(JSON.parse(serialiseAuthMessage(event)), ["AUTH", event])
})

Deno.test("serialiseAuthMessage - carries only the event's seven NIP-01 fields, in NIP-01 order", () => {
  const withExtra = { ...event, seenOn: ["wss://relay.example"] }
  assertEquals(serialiseAuthMessage(withExtra), `["AUTH",${serialiseEvent(event)}]`)
})

Deno.test("serialiseReqMessage - a filter is a JSON object, so a JSON array is not one (NIP-01, shared ADR-0092)", () => {
  // @ts-expect-error: NIP-01 says "filtersX is a JSON object", and an empty array is not one
  const filters: ReadonlyArray<NostrFilter> = [[]]
  assertEquals(filters.length, 1)
})
