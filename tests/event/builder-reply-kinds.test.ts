import { assertEquals } from "@std/assert"
import { buildReply } from "../../src/domain/service/reply.ts"
import {
  KIND_CHANNEL_MESSAGE,
  KIND_CHAT_MESSAGE,
  KIND_COMMENT,
  KIND_LIVE_CHAT_MESSAGE,
  KIND_TEXT_NOTE,
  KIND_VOICE_MESSAGE,
  KIND_VOICE_MESSAGE_COMMENT,
} from "../../src/domain/value-object/kinds.ts"
import type { Rumour, Tag } from "../../src/domain/value-object/nostr-event.ts"
import { eventIdFixture, publicKeyFixture, relayUrlFixture } from "../../testing.ts"

const author = publicKeyFixture("a1".repeat(32))
const third = publicKeyFixture("03".repeat(32))
const parentId = eventIdFixture("d".repeat(64))
const rootId = eventIdFixture("1".repeat(64))
const RELAY = relayUrlFixture("wss://relay.example.com")

const parentOf = (kind: number, tags: ReadonlyArray<Tag> = []): Rumour => ({
  id: parentId,
  pubkey: author,
  created_at: 1700000000,
  kind,
  content: "",
  tags,
})

Deno.test("buildReply - copies the root author an unmarked e tag names in its fifth element (shared ADR-0076)", () => {
  const parent = parentOf(KIND_TEXT_NOTE, [["e", rootId, "wss://root.example.com", "", third]])
  assertEquals(buildReply("x", parent).tags[0], ["e", rootId, "wss://root.example.com", "root", third])
})

Deno.test("buildReply - copies the root author an unmarked e tag names in its fourth element (shared ADR-0076)", () => {
  assertEquals(buildReply("x", parentOf(KIND_TEXT_NOTE, [["e", rootId, "", third]])).tags[0], [
    "e",
    rootId,
    "",
    "root",
    third,
  ])
})

Deno.test("buildReply - tags the root author an unmarked e tag names (shared ADR-0076)", () => {
  const tags = buildReply("x", parentOf(KIND_TEXT_NOTE, [["e", rootId, "", third]])).tags
  assertEquals(tags.some((tag) => tag[0] === "p" && tag[1] === third), true)
})

Deno.test("buildReply - a reply to a chat message is a chat message (shared ADR-0076)", () => {
  assertEquals(buildReply("x", parentOf(KIND_CHAT_MESSAGE)).kind, KIND_CHAT_MESSAGE)
})

Deno.test("buildReply - a reply to a chat message quotes its parent (NIP-C7)", () => {
  assertEquals(buildReply("x", parentOf(KIND_CHAT_MESSAGE)).tags, [["q", parentId, "", author]])
})

Deno.test("buildReply - a reply to a chat message names where the parent can be found", () => {
  assertEquals(buildReply("x", parentOf(KIND_CHAT_MESSAGE), RELAY).tags, [["q", parentId, RELAY, author]])
})

Deno.test("buildReply - a reply to a channel message is a channel message (shared ADR-0076)", () => {
  assertEquals(buildReply("x", parentOf(KIND_CHANNEL_MESSAGE)).kind, KIND_CHANNEL_MESSAGE)
})

Deno.test("buildReply - a reply to a channel message is rooted at its channel and replies to it (NIP-28)", () => {
  const channelId = eventIdFixture("4".repeat(64))
  const parent = parentOf(KIND_CHANNEL_MESSAGE, [["e", channelId, "wss://channel.example.com", "root"]])
  assertEquals(buildReply("x", parent).tags, [
    ["e", channelId, "wss://channel.example.com", "root"],
    ["e", parentId, "", "reply", author],
    ["p", author],
  ])
})

Deno.test("buildReply - a reply to a channel message names where the parent can be found", () => {
  assertEquals(buildReply("x", parentOf(KIND_CHANNEL_MESSAGE), RELAY).tags, [
    ["e", parentId, RELAY, "reply", author],
    ["p", author, RELAY],
  ])
})

Deno.test("buildReply - a reply to a live chat message is a live chat message (shared ADR-0076)", () => {
  assertEquals(buildReply("x", parentOf(KIND_LIVE_CHAT_MESSAGE)).kind, KIND_LIVE_CHAT_MESSAGE)
})

Deno.test("buildReply - a reply to a live chat message carries its activity and names the parent (NIP-53)", () => {
  const activity: Tag = ["a", `30311:${third}:stream`, "wss://live.example.com", "root"]
  assertEquals(buildReply("x", parentOf(KIND_LIVE_CHAT_MESSAGE, [activity])).tags, [activity, [
    "e",
    parentId,
    "",
    author,
  ]])
})

Deno.test("buildReply - a reply to a live chat message whose a tags disagree carries no activity (shared ADR-0014)", () => {
  const parent = parentOf(KIND_LIVE_CHAT_MESSAGE, [["a", `30311:${third}:one`], ["a", `30311:${third}:two`]])
  assertEquals(buildReply("x", parent).tags.filter((tag) => tag[0] === "a"), [])
})

Deno.test("buildReply - a reply to a voice message is a comment (shared ADR-0076)", () => {
  assertEquals(buildReply("x", parentOf(KIND_VOICE_MESSAGE)).kind, KIND_COMMENT)
})

Deno.test("buildReply - a reply to a voice message comment keeps its root scope (shared ADR-0076)", () => {
  const parent = parentOf(KIND_VOICE_MESSAGE_COMMENT, [["E", rootId, "", third], ["K", "1222"]])
  assertEquals(buildReply("x", parent).tags.slice(0, 2), [["E", rootId, "", third], ["K", "1222"]])
})
