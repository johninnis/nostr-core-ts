import { assertEquals, assertExists } from "@std/assert"
import { transformEvent } from "../../src/domain/service/transformer.ts"
import { formatAddressableRef } from "../../src/domain/value-object/addressable-ref.ts"
import type { NostrEvent } from "../../src/domain/value-object/nostr-event.ts"
import { parsePublicKey } from "../../src/domain/value-object/public-key.ts"
import { parseSig } from "../../src/domain/value-object/sig.ts"
import { parseEventId } from "../../src/domain/value-object/event-id.ts"
import {
  KIND_COMMENT,
  KIND_GENERIC_REPOST,
  KIND_HIGHLIGHT,
  KIND_LONGFORM,
  KIND_REACTION,
  KIND_REPOST,
  KIND_SHORT_NOTE,
} from "../../src/domain/value-object/kinds.ts"

const pk1 = parsePublicKey("a".repeat(64))
const pk2 = parsePublicKey("b".repeat(64))
const eid1 = parseEventId("c".repeat(64))
const eid2 = parseEventId("d".repeat(64))
const eid3 = parseEventId("e".repeat(64))

const makeEvent = (overrides: Partial<NostrEvent> & { kind: number }): NostrEvent => ({
  id: eid1,
  pubkey: pk1,
  sig: parseSig("f".repeat(128)),
  created_at: 1700000000,
  content: "",
  tags: [],
  ...overrides,
})

Deno.test("transformEvent - returns raw event unchanged", () => {
  const raw = makeEvent({ kind: KIND_SHORT_NOTE, content: "hello" })
  const result = transformEvent(raw)
  assertEquals(result.raw, raw)
})

Deno.test("transformEvent - short note without e-tags is not a reply", () => {
  const raw = makeEvent({ kind: KIND_SHORT_NOTE, content: "hello" })
  const result = transformEvent(raw)
  assertEquals(result.refs.isReply, false)
})

Deno.test("transformEvent - short note with root e-tag is a reply", () => {
  const raw = makeEvent({
    kind: KIND_SHORT_NOTE,
    tags: [["e", eid2, "", "root"], ["p", pk2]],
  })
  const result = transformEvent(raw)
  assertEquals(result.refs.isReply, true)
  assertEquals(result.refs.rootEvent, eid2)
})

Deno.test("transformEvent - short note with root and reply e-tags", () => {
  const raw = makeEvent({
    kind: KIND_SHORT_NOTE,
    tags: [
      ["e", eid2, "", "root"],
      ["e", eid3, "", "reply"],
      ["p", pk2],
    ],
  })
  const result = transformEvent(raw)
  assertEquals(result.refs.rootEvent, eid2)
  assertEquals(result.refs.replyToEvent, eid3)
  assertEquals(result.refs.isReply, true)
})

Deno.test("transformEvent - short note with positional e-tags (no markers) uses first as root", () => {
  const raw = makeEvent({
    kind: KIND_SHORT_NOTE,
    tags: [["e", eid2], ["e", eid3]],
  })
  const result = transformEvent(raw)
  assertEquals(result.refs.rootEvent, eid2)
  assertEquals(result.refs.replyToEvent, eid3)
  assertEquals(result.refs.isReply, true)
})

Deno.test("transformEvent - short note with single positional e-tag uses it as root only", () => {
  const raw = makeEvent({
    kind: KIND_SHORT_NOTE,
    tags: [["e", eid2]],
  })
  const result = transformEvent(raw)
  assertEquals(result.refs.rootEvent, eid2)
  assertEquals(result.refs.replyToEvent, null)
  assertEquals(result.refs.isReply, true)
})

Deno.test("transformEvent - short note with only a reply marker (no root) treats the reply target as root", () => {
  const raw = makeEvent({
    kind: KIND_SHORT_NOTE,
    tags: [["e", eid2, "", "reply"], ["p", pk2]],
  })
  const result = transformEvent(raw)
  assertEquals(result.refs.replyToEvent, eid2)
  assertEquals(result.refs.rootEvent, eid2)
  assertEquals(result.refs.isReply, true)
})

Deno.test("transformEvent - extracts mentioned pubkeys", () => {
  const raw = makeEvent({
    kind: KIND_SHORT_NOTE,
    tags: [["p", pk1], ["p", pk2]],
  })
  const result = transformEvent(raw)
  assertEquals(result.refs.mentionedPubkeys.includes(pk1), true)
  assertEquals(result.refs.mentionedPubkeys.includes(pk2), true)
})

Deno.test("transformEvent - deduplicates mentioned events", () => {
  const raw = makeEvent({
    kind: KIND_SHORT_NOTE,
    tags: [["e", eid2, "", "root"], ["e", eid2, "", "mention"]],
  })
  const result = transformEvent(raw)
  assertEquals(result.refs.mentionedEvents.length, 1)
})

Deno.test("transformEvent - repost kind returns repost kindData", () => {
  const raw = makeEvent({
    kind: KIND_REPOST,
    tags: [["e", eid2], ["p", pk2]],
  })
  const result = transformEvent(raw)
  assertExists(result.kindData.repost)
  assertEquals(result.kindData.repost.originalEventId, eid2)
})

Deno.test("transformEvent - repost is not flagged as reply", () => {
  const raw = makeEvent({
    kind: KIND_REPOST,
    tags: [["e", eid2], ["p", pk2]],
  })
  const result = transformEvent(raw)
  assertEquals(result.refs.isReply, false)
})

Deno.test("transformEvent - generic repost returns repost kindData", () => {
  const raw = makeEvent({
    kind: KIND_GENERIC_REPOST,
    tags: [["e", eid2]],
  })
  const result = transformEvent(raw)
  assertExists(result.kindData.repost)
  assertEquals(result.kindData.repost.originalEventId, eid2)
})

Deno.test("transformEvent - reaction returns reaction kindData with default +", () => {
  const raw = makeEvent({
    kind: KIND_REACTION,
    content: "",
    tags: [["e", eid2], ["p", pk2]],
  })
  const result = transformEvent(raw)
  assertExists(result.kindData.reaction)
  assertEquals(result.kindData.reaction.content, "+")
  assertEquals(result.kindData.reaction.targetEventId, eid2)
})

Deno.test("transformEvent - reaction.content passes through the raw event content", () => {
  const raw = makeEvent({
    kind: KIND_REACTION,
    content: "🤙",
    tags: [["e", eid2]],
  })
  const result = transformEvent(raw)
  assertExists(result.kindData.reaction)
  assertEquals(result.kindData.reaction.content, "🤙")
})

Deno.test("transformEvent - reaction targets last e-tag", () => {
  const raw = makeEvent({
    kind: KIND_REACTION,
    content: "+",
    tags: [["e", eid2], ["e", eid3]],
  })
  const result = transformEvent(raw)
  assertExists(result.kindData.reaction)
  assertEquals(result.kindData.reaction.targetEventId, eid3)
})

Deno.test("transformEvent - reaction is not flagged as reply", () => {
  const raw = makeEvent({
    kind: KIND_REACTION,
    content: "+",
    tags: [["e", eid2]],
  })
  const result = transformEvent(raw)
  assertEquals(result.refs.isReply, false)
})

Deno.test("transformEvent - highlight returns highlight kindData", () => {
  const raw = makeEvent({
    kind: KIND_HIGHLIGHT,
    content: "highlighted text",
    tags: [
      ["r", "https://example.com/article"],
      ["context", "surrounding text"],
      ["comment", "my thoughts"],
    ],
  })
  const result = transformEvent(raw)
  assertExists(result.kindData.highlight)
  assertEquals(result.kindData.highlight.text, "highlighted text")
  assertEquals(result.kindData.highlight.sourceUrl, "https://example.com/article")
  assertEquals(result.kindData.highlight.context, "surrounding text")
  assertEquals(result.kindData.highlight.comment, "my thoughts")
})

Deno.test("transformEvent - highlight with e-tag source event", () => {
  const raw = makeEvent({
    kind: KIND_HIGHLIGHT,
    content: "text",
    tags: [["e", eid2]],
  })
  const result = transformEvent(raw)
  assertExists(result.kindData.highlight)
  assertEquals(result.kindData.highlight.sourceEventId, eid2)
  assertEquals(result.kindData.highlight.sourceUrl, null)
})

Deno.test("transformEvent - highlight with a-tag source uses naddr encoding", () => {
  const raw = makeEvent({
    kind: KIND_HIGHLIGHT,
    content: "text",
    tags: [["a", formatAddressableRef({ kind: KIND_LONGFORM, pubkey: pk2, dTag: "my-article" })]],
  })
  const result = transformEvent(raw)
  assertExists(result.kindData.highlight)
  const sourceEventId = result.kindData.highlight.sourceEventId
  assertExists(sourceEventId)
  assertEquals(typeof sourceEventId, "string")
  assertEquals(sourceEventId.startsWith("naddr1"), true)
})

Deno.test("transformEvent - longform returns longform kindData", () => {
  const raw = makeEvent({
    kind: KIND_LONGFORM,
    content: "# Article\n\nBody text",
    tags: [
      ["title", "My Article"],
      ["summary", "A brief summary"],
      ["image", "https://example.com/image.jpg"],
      ["published_at", "1700000000"],
      ["t", "nostr"],
      ["t", "bitcoin"],
    ],
  })
  const result = transformEvent(raw)
  assertExists(result.kindData.longform)
  assertEquals(result.kindData.longform.title, "My Article")
  assertEquals(result.kindData.longform.summary, "A brief summary")
  assertEquals(result.kindData.longform.image, "https://example.com/image.jpg")
  assertEquals(result.kindData.longform.publishedAt, 1700000000)
  assertEquals(result.kindData.longform.topics.length, 2)
  assertEquals(result.kindData.longform.topics[0], "nostr")
})

Deno.test("transformEvent - longform with missing optional tags returns nulls", () => {
  const raw = makeEvent({ kind: KIND_LONGFORM })
  const result = transformEvent(raw)
  assertExists(result.kindData.longform)
  assertEquals(result.kindData.longform.title, null)
  assertEquals(result.kindData.longform.summary, null)
  assertEquals(result.kindData.longform.image, null)
  assertEquals(result.kindData.longform.publishedAt, null)
  assertEquals(result.kindData.longform.topics.length, 0)
})

Deno.test("transformEvent - comment kind with e-tag is a reply", () => {
  const raw = makeEvent({
    kind: KIND_COMMENT,
    tags: [["e", eid2]],
  })
  const result = transformEvent(raw)
  assertEquals(result.refs.isReply, true)
  assertEquals(result.refs.replyToEvent, eid2)
})

Deno.test("transformEvent - comment kind uses e-tag as replyToEvent (not positional)", () => {
  const raw = makeEvent({
    kind: KIND_COMMENT,
    tags: [["e", eid2], ["e", eid3]],
  })
  const result = transformEvent(raw)
  assertEquals(result.refs.replyToEvent, eid3)
})

Deno.test("transformEvent - comment with uppercase E-tag sets rootEvent", () => {
  const raw = makeEvent({
    kind: KIND_COMMENT,
    tags: [["E", eid2], ["e", eid3]],
  })
  const result = transformEvent(raw)
  assertEquals(result.refs.rootEvent, eid2)
})

Deno.test("transformEvent - short note quoting via q tag with unmarked e tag is not a reply", () => {
  const raw = makeEvent({
    kind: KIND_SHORT_NOTE,
    tags: [["q", eid2], ["e", eid2]],
  })
  const result = transformEvent(raw)
  assertEquals(result.refs.isReply, false)
  assertEquals(result.refs.rootEvent, null)
  assertEquals(result.refs.replyToEvent, null)
  assertEquals(result.refs.mentionedEvents.includes(eid2), true)
})

Deno.test("transformEvent - short note quoting via q tag with mention-marked e tag is not a reply", () => {
  const raw = makeEvent({
    kind: KIND_SHORT_NOTE,
    tags: [["q", eid2], ["e", eid2, "", "mention"], ["p", pk2]],
  })
  const result = transformEvent(raw)
  assertEquals(result.refs.isReply, false)
})

Deno.test("transformEvent - reply that also quotes another note stays a reply with the quote excluded", () => {
  const raw = makeEvent({
    kind: KIND_SHORT_NOTE,
    tags: [["e", eid2], ["q", eid3], ["e", eid3]],
  })
  const result = transformEvent(raw)
  assertEquals(result.refs.isReply, true)
  assertEquals(result.refs.rootEvent, eid2)
  assertEquals(result.refs.replyToEvent, null)
})

Deno.test("transformEvent - reply with explicit markers that also quotes is unaffected", () => {
  const raw = makeEvent({
    kind: KIND_SHORT_NOTE,
    tags: [["e", eid2, "", "root"], ["q", eid3], ["e", eid3, "", "mention"]],
  })
  const result = transformEvent(raw)
  assertEquals(result.refs.isReply, true)
  assertEquals(result.refs.rootEvent, eid2)
})

Deno.test("transformEvent - comment quoting via q tag does not treat the quote as its parent", () => {
  const raw = makeEvent({
    kind: KIND_COMMENT,
    tags: [["e", eid2], ["q", eid3], ["e", eid3]],
  })
  const result = transformEvent(raw)
  assertEquals(result.refs.replyToEvent, eid2)
})

Deno.test("transformEvent - unknown kind returns empty kindData", () => {
  const raw = makeEvent({ kind: 99999 })
  const result = transformEvent(raw)
  assertEquals(result.kindData.repost, undefined)
  assertEquals(result.kindData.reaction, undefined)
  assertEquals(result.kindData.highlight, undefined)
  assertEquals(result.kindData.longform, undefined)
})
