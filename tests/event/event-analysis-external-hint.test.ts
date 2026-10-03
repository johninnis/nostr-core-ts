import { assertEquals } from "@std/assert"
import { analyseEvent } from "../../src/domain/service/event-analysis.ts"
import { KIND_COMMENT } from "../../src/domain/value-object/kinds.ts"
import type { Tag } from "../../src/domain/value-object/nostr-event.ts"
import { eventIdFixture, publicKeyFixture } from "../../testing.ts"

const PAGE_ID = "podcast:item:guid:d98d189b-dc7b-45b1-8720-d4b98690f31f"

const refsOf = (tags: ReadonlyArray<Tag>) =>
  analyseEvent({
    id: eventIdFixture("c".repeat(64)),
    pubkey: publicKeyFixture("a".repeat(64)),
    kind: KIND_COMMENT,
    created_at: 1700000000,
    content: "",
    tags,
  }).refs

const externalRootHint = (hints: ReadonlyArray<string | null>): string | null => {
  const iTags = hints.map((hint): Tag => hint === null ? ["I", PAGE_ID] : ["I", PAGE_ID, hint])
  const root = refsOf([...iTags, ["K", "podcast:item:guid"]]).rootEvent
  return root?.type === "external" ? root.hint : "not external"
}

Deno.test("analyseEvent - an external content hint is read in its NIP-98 URL form (shared ADR-0090)", () => {
  assertEquals(externalRootHint(["HTTPS://Fountain.FM:443/episode/1#top"]), "https://fountain.fm/episode/1")
})

Deno.test("analyseEvent - an external content hint that is no web page is dropped and the content still read (shared ADR-0090)", () => {
  assertEquals([externalRootHint(["javascript:alert(1)"]), externalRootHint(["wss://relay.example.com"])], [null, null])
})

Deno.test("analyseEvent - external content without a hint reads with none", () => {
  assertEquals(externalRootHint([null]), null)
})

Deno.test("analyseEvent - external content hints stating one web page, however written, are that one hint (shared ADR-0090)", () => {
  const hints = ["https://fountain.fm/episode/1", "HTTPS://fountain.fm:443/episode/1", null, "javascript:alert(1)"]
  assertEquals(externalRootHint(hints), "https://fountain.fm/episode/1")
})

Deno.test("analyseEvent - external content hints naming different web pages state no hint (shared ADR-0090)", () => {
  assertEquals(externalRootHint(["https://fountain.fm/episode/1", "https://fountain.fm/episode/2"]), null)
})

Deno.test("analyseEvent - a comment's parent external content keeps its i hint (shared ADR-0090)", () => {
  const parent = refsOf([["I", PAGE_ID], ["K", "podcast:item:guid"], ["i", PAGE_ID, "https://fountain.fm/episode/1"], [
    "k",
    "podcast:item:guid",
  ]]).replyToEvent
  assertEquals(parent?.type === "external" ? parent.hint : "not external", "https://fountain.fm/episode/1")
})
