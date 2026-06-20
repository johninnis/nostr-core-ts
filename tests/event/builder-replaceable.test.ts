import { assertEquals } from "@std/assert"
import { buildAppSettings, buildMetadata, buildRelayList } from "../../src/domain/service/builder.ts"
import { KIND_APP_SETTINGS, KIND_METADATA, KIND_RELAY_LIST } from "../../src/domain/value-object/kinds.ts"
import type { Tag } from "../../src/domain/value-object/nostr-event.ts"

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
  assertEquals(event.kind, KIND_APP_SETTINGS)
  assertEquals(event.tags, [["d", "hubstr-settings"]])
  assertEquals(event.content, "encrypted-payload")
})
