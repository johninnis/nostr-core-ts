import { assertEquals } from "@std/assert"
import { serialiseEvent } from "../../src/domain/service/event-json.ts"
import type { NostrEvent } from "../../src/domain/value-object/nostr-event.ts"
import { eventIdFixture, publicKeyFixture, sigFixture } from "../../testing.ts"

const event: NostrEvent = {
  id: eventIdFixture("a".repeat(64)),
  pubkey: publicKeyFixture("b".repeat(64)),
  created_at: 1700000000,
  kind: 1,
  tags: [["t", "nostr"]],
  content: "hello",
  sig: sigFixture("c".repeat(128)),
}

const NIP01_JSON = `{"id":"${"a".repeat(64)}","pubkey":"${"b".repeat(64)}","created_at":1700000000,"kind":1,` +
  `"tags":[["t","nostr"]],"content":"hello","sig":"${"c".repeat(128)}"}`

Deno.test("serialiseEvent - writes the seven NIP-01 fields in NIP-01 order whatever the object's order", () => {
  const { id, pubkey, created_at, kind, tags, content, sig } = event
  assertEquals(serialiseEvent({ sig, content, tags, kind, created_at, pubkey, id }), NIP01_JSON)
})

Deno.test("serialiseEvent - leaves out a key the event object carries beyond its NIP-01 fields", () => {
  const withExtra = { ...event, seenOn: ["wss://relay.example"] }
  assertEquals(serialiseEvent(withExtra), NIP01_JSON)
})
