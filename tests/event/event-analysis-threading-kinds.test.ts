import { assertEquals } from "@std/assert"
import { analyseEvent } from "../../src/domain/service/event-analysis.ts"
import {
  KIND_CHANNEL_MESSAGE,
  KIND_CHAT_MESSAGE,
  KIND_LIVE_CHAT_MESSAGE,
  KIND_VOICE_MESSAGE_COMMENT,
} from "../../src/domain/value-object/kinds.ts"
import type { Tag } from "../../src/domain/value-object/nostr-event.ts"
import { eventIdFixture, publicKeyFixture } from "../../testing.ts"

const author = publicKeyFixture("a".repeat(64))
const rootId = eventIdFixture("c".repeat(64))
const parentId = eventIdFixture("d".repeat(64))
const otherId = eventIdFixture("e".repeat(64))

const refsOf = (kind: number, tags: ReadonlyArray<Tag>) =>
  analyseEvent({ id: eventIdFixture("f".repeat(64)), pubkey: author, kind, created_at: 1700000000, content: "", tags })
    .refs

Deno.test("analyseEvent - a voice message comment naming its root is a reply (shared ADR-0012)", () => {
  assertEquals(refsOf(KIND_VOICE_MESSAGE_COMMENT, [["E", rootId], ["K", "1222"]]).isReply, true)
})

Deno.test("analyseEvent - a voice message comment reads its parent as a comment does (shared ADR-0012)", () => {
  const tags: ReadonlyArray<Tag> = [["E", rootId], ["K", "1222"], ["e", parentId], ["k", "1244"]]
  assertEquals(refsOf(KIND_VOICE_MESSAGE_COMMENT, tags).replyToEvent, { type: "event", id: parentId })
})

Deno.test("analyseEvent - a channel message with a reply marker is a reply (shared ADR-0012)", () => {
  const tags: ReadonlyArray<Tag> = [["e", rootId, "", "root"], ["e", parentId, "", "reply"]]
  assertEquals(refsOf(KIND_CHANNEL_MESSAGE, tags).isReply, true)
})

Deno.test("analyseEvent - a channel message naming only its channel is no reply (shared ADR-0012)", () => {
  assertEquals(refsOf(KIND_CHANNEL_MESSAGE, [["e", rootId, "", "root"]]).isReply, false)
})

Deno.test("analyseEvent - a channel message's root is its channel (shared ADR-0012)", () => {
  assertEquals(refsOf(KIND_CHANNEL_MESSAGE, [["e", rootId, "", "root"]]).rootEvent, { type: "event", id: rootId })
})

Deno.test("analyseEvent - a channel message reads an unmarked e tag as no parent (shared ADR-0012)", () => {
  const tags: ReadonlyArray<Tag> = [["e", rootId, "", "root"], ["e", parentId]]
  assertEquals(refsOf(KIND_CHANNEL_MESSAGE, tags).replyToEvent, null)
})

const ACTIVITY = `30311:${author}:stream`

Deno.test("analyseEvent - a live chat message naming an event is a reply (shared ADR-0012)", () => {
  assertEquals(refsOf(KIND_LIVE_CHAT_MESSAGE, [["a", ACTIVITY], ["e", parentId]]).isReply, true)
})

Deno.test("analyseEvent - a live chat message's e tag is its parent, whatever its marker (shared ADR-0012)", () => {
  const refs = refsOf(KIND_LIVE_CHAT_MESSAGE, [["e", parentId, "", "root"]])
  assertEquals(refs.replyToEvent, { type: "event", id: parentId })
})

Deno.test("analyseEvent - a live chat message has no root (shared ADR-0012)", () => {
  assertEquals(refsOf(KIND_LIVE_CHAT_MESSAGE, [["e", parentId, "", "root"]]).rootEvent, null)
})

Deno.test("analyseEvent - a live chat message naming only its activity is no reply (shared ADR-0012)", () => {
  assertEquals(refsOf(KIND_LIVE_CHAT_MESSAGE, [["a", ACTIVITY]]).isReply, false)
})

Deno.test("analyseEvent - a live chat message's e tags that disagree name no parent (shared ADR-0012)", () => {
  assertEquals(refsOf(KIND_LIVE_CHAT_MESSAGE, [["e", parentId], ["e", otherId]]).replyToEvent, null)
})

Deno.test("analyseEvent - a chat message quoting an event is a reply (shared ADR-0012)", () => {
  assertEquals(refsOf(KIND_CHAT_MESSAGE, [["q", parentId, "", author]]).isReply, true)
})

Deno.test("analyseEvent - a chat message's parent is its first q tag naming an event (shared ADR-0012)", () => {
  const tags: ReadonlyArray<Tag> = [["q", `30023:${author}:post`], ["q", parentId], ["q", otherId]]
  assertEquals(refsOf(KIND_CHAT_MESSAGE, tags).replyToEvent, { type: "event", id: parentId })
})

Deno.test("analyseEvent - a chat message has no root (shared ADR-0012)", () => {
  assertEquals(refsOf(KIND_CHAT_MESSAGE, [["e", rootId, "", "root"], ["q", parentId]]).rootEvent, null)
})

Deno.test("analyseEvent - a chat message naming an event only by an e tag is no reply (shared ADR-0012)", () => {
  assertEquals(refsOf(KIND_CHAT_MESSAGE, [["e", parentId]]).isReply, false)
})
