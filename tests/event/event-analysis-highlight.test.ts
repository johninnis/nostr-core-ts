import { assertEquals } from "@std/assert"
import { analyseEvent } from "../../src/domain/service/event-analysis.ts"
import { KIND_HIGHLIGHT } from "../../src/domain/value-object/kinds.ts"
import type { Tag } from "../../src/domain/value-object/nostr-event.ts"
import { eventIdFixture, publicKeyFixture } from "../../testing.ts"

const sourceUrlOf = (tags: ReadonlyArray<Tag>): string | null => {
  const kindData = analyseEvent({
    id: eventIdFixture("c".repeat(64)),
    pubkey: publicKeyFixture("a".repeat(64)),
    kind: KIND_HIGHLIGHT,
    created_at: 1700000000,
    content: "text",
    tags,
  }).kindData
  if (kindData?.type !== "highlight") throw new Error("expected highlight kindData")
  return kindData.sourceUrl
}

Deno.test("analyseEvent - a highlight's source url is its r tag marked source, not a url the comment mentions", () => {
  const tags: ReadonlyArray<Tag> = [["r", "https://mentioned.example", "mention"], [
    "r",
    "https://source.example",
    "source",
  ]]
  assertEquals(sourceUrlOf(tags), "https://source.example/")
})

Deno.test("analyseEvent - a highlight whose only r tag is a mention has no source url", () => {
  assertEquals(sourceUrlOf([["r", "https://mentioned.example", "mention"]]), null)
})

Deno.test("analyseEvent - an unmarked r tag is a highlight's source when none is marked source", () => {
  assertEquals(
    sourceUrlOf([["r", "https://mentioned.example", "mention"], ["r", "https://plain.example"]]),
    "https://plain.example/",
  )
})

Deno.test("analyseEvent - r tags marked source that name different urls name no source (shared ADR-0014)", () => {
  assertEquals(sourceUrlOf([["r", "https://one.example", "source"], ["r", "https://two.example", "source"]]), null)
})

Deno.test("analyseEvent - unmarked r tags that name different urls name no source (shared ADR-0014)", () => {
  assertEquals(sourceUrlOf([["r", "https://one.example"], ["r", "https://two.example"]]), null)
})

Deno.test("analyseEvent - an r tag that is text, not a web URL, is never a highlight's source url", () => {
  assertEquals(sourceUrlOf([["r", "some text"], ["r", "https://plain.example"]]), "https://plain.example/")
})

Deno.test("analyseEvent - an r tag marked source that is not a web URL names no source url", () => {
  assertEquals(sourceUrlOf([["r", "wss://relay.example", "source"]]), null)
})

Deno.test("analyseEvent - an r tag that only starts like a web URL is not a highlight's source (shared ADR-0087)", () => {
  assertEquals(sourceUrlOf([["r", "https://", "source"]]), null)
})

Deno.test("analyseEvent - a highlight's source url is held in its canonical form (shared ADR-0081)", () => {
  assertEquals(sourceUrlOf([["r", "HTTPS://Source.Example:443", "source"]]), "https://source.example/")
})

Deno.test("analyseEvent - r tags spelling one page differently are one claim on the source (shared ADR-0087)", () => {
  assertEquals(
    sourceUrlOf([["r", "https://source.example/page", "source"], ["r", "HTTPS://SOURCE.example:443/page", "source"]]),
    "https://source.example/page",
  )
})

Deno.test("analyseEvent - a highlight's empty context and comment read as empty strings (shared ADR-0079)", () => {
  const kindData = analyseEvent({
    id: eventIdFixture("c".repeat(64)),
    pubkey: publicKeyFixture("a".repeat(64)),
    kind: KIND_HIGHLIGHT,
    created_at: 1700000000,
    content: "text",
    tags: [["context", ""], ["comment", ""]],
  }).kindData
  if (kindData?.type !== "highlight") throw new Error("expected highlight kindData")
  assertEquals([kindData.context, kindData.comment], ["", ""])
})
