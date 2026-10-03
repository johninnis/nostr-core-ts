import { assertEquals, assertThrows } from "@std/assert"
import { buildAppSettings, buildMetadata, buildRelayList } from "../../src/domain/service/builder.ts"
import { KIND_APPLICATION_SPECIFIC_DATA, KIND_METADATA, KIND_RELAY_LIST } from "../../src/domain/value-object/kinds.ts"
import type { Tag } from "../../src/domain/value-object/nostr-event.ts"
import { parseJson } from "../../src/domain/service/json.ts"
import { isRecord } from "../../src/domain/service/guards.ts"
import { InvalidArgumentError } from "../../src/domain/exception/invalid-argument-error.ts"

Deno.test("buildMetadata - creates kind 0 event with JSON content and no tags", () => {
  const event = buildMetadata({ name: "alice", about: "nostrich" })
  assertEquals(event.kind, KIND_METADATA)
  assertEquals(event.tags, [])
  assertEquals(JSON.parse(event.content), { name: "alice", about: "nostrich" })
})

Deno.test("buildRelayList - creates kind 10002 event carrying the given tags", () => {
  const tags: ReadonlyArray<Tag> = [["r", "wss://relay.damus.io"], ["r", "wss://nos.lol", "read"]]
  const event = buildRelayList(tags)
  assertEquals(event.kind, KIND_RELAY_LIST)
  assertEquals(event.tags, tags)
  assertEquals(event.content, "")
})

Deno.test("buildRelayList - preserves provided content", () => {
  const event = buildRelayList([], "carried")
  assertEquals(event.content, "carried")
})

Deno.test("buildAppSettings - creates kind 30078 event addressed by d-tag", () => {
  const event = buildAppSettings("hubstr-settings", "encrypted-payload")
  assertEquals(event.kind, KIND_APPLICATION_SPECIFIC_DATA)
  assertEquals(event.tags, [["d", "hubstr-settings"]])
  assertEquals(event.content, "encrypted-payload")
})

Deno.test("buildMetadata - keeps non-string fields such as a boolean flag", () => {
  const event = buildMetadata({ name: "alice", bot: true })
  assertEquals(JSON.parse(event.content), { name: "alice", bot: true })
})

Deno.test("buildMetadata - takes a parsed kind-0 record back, every field kept", () => {
  const parsed = parseJson('{"name":"alice","nested":{"list":[1,null,true]}}')
  if (!parsed.success || !isRecord(parsed.value)) throw new Error("expected an object")
  const event = buildMetadata(parsed.value)
  assertEquals(JSON.parse(event.content), { name: "alice", nested: { list: [1, null, true] } })
})

Deno.test("buildMetadata - refuses a value that is not JSON by type", () => {
  // @ts-expect-error a bigint is no JSON
  assertThrows(() => buildMetadata({ name: "alice", zaps: 1n }), TypeError)
  const untyped: Record<string, unknown> = { name: "alice" }
  // @ts-expect-error an un-narrowed unknown may be no JSON
  buildMetadata(untyped)
})

Deno.test("buildMetadata - throws for a value JSON.stringify writes nothing for", () => {
  // @ts-expect-error a function is no JSON
  assertThrows(() => buildMetadata(() => "alice"), InvalidArgumentError)
})

Deno.test("buildMetadata - throws for a value that is not a JSON object, as kind-0 content is", () => {
  assertThrows(() => buildMetadata(["alice"]), InvalidArgumentError)
})
