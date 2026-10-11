import { assertEquals, assertThrows } from "@std/assert"
import { InvalidArgumentError } from "../../src/domain/exception/invalid-argument-error.ts"
import {
  buildGroupChatMessage,
  groupRelayHintOf,
  groupTagOf,
  withGroupTag,
} from "../../src/domain/service/group-chat.ts"
import { buildReply } from "../../src/domain/service/reply.ts"
import { KIND_CHAT_MESSAGE } from "../../src/domain/value-object/kinds.ts"
import type { UnsignedEvent } from "../../src/domain/value-object/nostr-event.ts"
import { buildEventFixture, relayUrlFixture } from "../../testing.ts"

const relay = relayUrlFixture("wss://groups.example.com")

Deno.test("groupTagOf returns the h tag with its relay hint", () => {
  const event = buildEventFixture({ kind: KIND_CHAT_MESSAGE, tags: [["h", "g1", "wss://relay.example.com"]] })
  assertEquals(groupTagOf(event), ["h", "g1", "wss://relay.example.com"])
})

Deno.test("groupTagOf writes the hint in its canonical form (shared ADR-0101)", () => {
  const event = buildEventFixture({ kind: KIND_CHAT_MESSAGE, tags: [["h", "g1", "WSS://Groups.Example.com/"]] })
  assertEquals(groupTagOf(event), ["h", "g1", relay])
})

Deno.test("groupTagOf reads h tags naming one group with different hints as that group, with no hint (shared ADR-0014)", () => {
  const event = buildEventFixture({
    kind: KIND_CHAT_MESSAGE,
    tags: [["h", "g1", "wss://a.example.com"], ["h", "g1", "wss://b.example.com"]],
  })
  assertEquals(groupTagOf(event), ["h", "g1"])
})

Deno.test("groupTagOf reads h tags naming different groups as no group, whatever their order (shared ADR-0014)", () => {
  const event = buildEventFixture({ kind: KIND_CHAT_MESSAGE, tags: [["h", "g1"], ["h", "g2"]] })
  assertEquals(groupTagOf(event), null)
})

Deno.test("groupTagOf keeps the hint of the one tag that states it beside a tag stating none (shared ADR-0014)", () => {
  const event = buildEventFixture({
    kind: KIND_CHAT_MESSAGE,
    tags: [["h", "g1"], ["h", "g1", "wss://groups.example.com"]],
  })
  assertEquals(groupTagOf(event), ["h", "g1", relay])
})

Deno.test("groupTagOf lets a hint that is no relay URL take no part (shared ADR-0101)", () => {
  const event = buildEventFixture({
    kind: KIND_CHAT_MESSAGE,
    tags: [["h", "g1", "not a relay"], ["h", "g1", "wss://groups.example.com"]],
  })
  assertEquals(groupTagOf(event), ["h", "g1", relay])
})

Deno.test("groupTagOf returns the h tag without a hint", () => {
  const event = buildEventFixture({ kind: KIND_CHAT_MESSAGE, tags: [["h", "g1"]] })
  assertEquals(groupTagOf(event), ["h", "g1"])
})

Deno.test("groupTagOf returns null when there is no h tag", () => {
  const event = buildEventFixture({ kind: 1, tags: [["e", "a".repeat(64)]] })
  assertEquals(groupTagOf(event), null)
})

Deno.test("groupTagOf ignores an empty h tag value", () => {
  const event = buildEventFixture({ kind: KIND_CHAT_MESSAGE, tags: [["h", ""]] })
  assertEquals(groupTagOf(event), null)
})

Deno.test("groupRelayHintOf returns the normalised relay hint from the h tag", () => {
  const event = buildEventFixture({ kind: KIND_CHAT_MESSAGE, tags: [["h", "g1", "wss://groups.example.com/"]] })
  assertEquals(groupRelayHintOf(event), relay)
})

Deno.test("groupRelayHintOf returns null when the h tag carries no hint", () => {
  const event = buildEventFixture({ kind: KIND_CHAT_MESSAGE, tags: [["h", "g1"]] })
  assertEquals(groupRelayHintOf(event), null)
})

Deno.test("groupRelayHintOf returns null when the hint is not a valid relay URL", () => {
  const event = buildEventFixture({ kind: KIND_CHAT_MESSAGE, tags: [["h", "g1", "not-a-url"]] })
  assertEquals(groupRelayHintOf(event), null)
})

Deno.test("groupRelayHintOf reads hints that disagree as no hint, never the first tag's (shared ADR-0014)", () => {
  const event = buildEventFixture({
    kind: KIND_CHAT_MESSAGE,
    tags: [["h", "g1", "wss://a.example.com"], ["h", "g1", "wss://b.example.com"]],
  })
  assertEquals(groupRelayHintOf(event), null)
})

Deno.test("groupRelayHintOf reads hints naming one relay, however spelled, as that relay (shared ADR-0101)", () => {
  const event = buildEventFixture({
    kind: KIND_CHAT_MESSAGE,
    tags: [["h", "g1", "wss://groups.example.com"], ["h", "g1", "WSS://groups.example.com/"]],
  })
  assertEquals(groupRelayHintOf(event), relay)
})

Deno.test("groupRelayHintOf returns null when there is no h tag", () => {
  const event = buildEventFixture({ kind: 1, tags: [] })
  assertEquals(groupRelayHintOf(event), null)
})

const reaction: UnsignedEvent = { kind: 7, created_at: 0, content: "+", tags: [["e", "a".repeat(64)]] }

Deno.test("withGroupTag copies the h tag with the resolved relay as its hint", () => {
  const target = buildEventFixture({ kind: KIND_CHAT_MESSAGE, tags: [["h", "g1"]] })
  assertEquals(withGroupTag(reaction, target, relay).tags, [["e", "a".repeat(64)], ["h", "g1", relay]])
})

Deno.test("withGroupTag replaces a stale hint with the resolved relay", () => {
  const target = buildEventFixture({ kind: KIND_CHAT_MESSAGE, tags: [["h", "g1", "wss://stale.example.com"]] })
  assertEquals(withGroupTag(reaction, target, relay).tags, [["e", "a".repeat(64)], ["h", "g1", relay]])
})

Deno.test("withGroupTag keeps the target's own hint when no relay resolves", () => {
  const target = buildEventFixture({ kind: KIND_CHAT_MESSAGE, tags: [["h", "g1", "wss://groups.example.com"]] })
  assertEquals(withGroupTag(reaction, target, null).tags, [["e", "a".repeat(64)], ["h", "g1", relay]])
})

Deno.test("withGroupTag drops a target hint that is not a relay URL when no relay resolves", () => {
  const target = buildEventFixture({ kind: KIND_CHAT_MESSAGE, tags: [["h", "g1", "not a relay", "extra"]] })
  assertEquals(withGroupTag(reaction, target, null).tags, [["e", "a".repeat(64)], ["h", "g1"]])
})

Deno.test("withGroupTag leaves the event untouched when the target is not a group message", () => {
  const target = buildEventFixture({ kind: 1, tags: [["t", "nostr"]] })
  assertEquals(withGroupTag(reaction, target, relay), reaction)
})

Deno.test("withGroupTag carries the target's h tags as written when they name different groups (shared ADR-0014, shared ADR-0045)", () => {
  const target = buildEventFixture({ kind: KIND_CHAT_MESSAGE, tags: [["h", "g1", "wss://a.example.com"], ["h", "g2"]] })
  assertEquals(withGroupTag(reaction, target, relay).tags, [
    ["e", "a".repeat(64)],
    ["h", "g1", "wss://a.example.com"],
    ["h", "g2"],
  ])
})

Deno.test("withGroupTag carries only the target's non-empty h tags when they name different groups", () => {
  const target = buildEventFixture({ kind: KIND_CHAT_MESSAGE, tags: [["h", "g1"], ["h", ""], ["h", "g2"]] })
  assertEquals(withGroupTag(reaction, target, relay).tags, [["e", "a".repeat(64)], ["h", "g1"], ["h", "g2"]])
})

Deno.test("withGroupTag leaves the event untouched when the target's only h tag names no group", () => {
  const target = buildEventFixture({ kind: KIND_CHAT_MESSAGE, tags: [["h", ""]] })
  assertEquals(withGroupTag(reaction, target, relay), reaction)
})

Deno.test("withGroupTag leaves the event untouched when there is no target", () => {
  assertEquals(withGroupTag(reaction, null, relay), reaction)
})

Deno.test("withGroupTag writes the h tag of a group the caller names by its id, with its relay as the hint", () => {
  assertEquals(withGroupTag(reaction, "g1", relay).tags, [["e", "a".repeat(64)], ["h", "g1", relay]])
})

Deno.test("withGroupTag writes the h tag of a group named by its id without a hint when no relay is known", () => {
  assertEquals(withGroupTag(reaction, "g1", null).tags, [["e", "a".repeat(64)], ["h", "g1"]])
})

Deno.test("withGroupTag writes the known group whatever the h tags of the event answered state (shared ADR-0101)", () => {
  const parent = buildEventFixture({ kind: KIND_CHAT_MESSAGE, tags: [["h", "g1"], ["h", "g2"]] })
  const reply = withGroupTag(buildReply("re: hi", parent, relay), "g1", relay)
  assertEquals(reply.tags.filter((tag) => tag[0] === "h"), [["h", "g1", relay]])
})

Deno.test("withGroupTag throws for a group named by the empty id, which names no group (shared ADR-0101)", () => {
  assertThrows(() => withGroupTag(reaction, "", relay), InvalidArgumentError)
})

Deno.test("buildGroupChatMessage builds a kind 9", () => {
  assertEquals(buildGroupChatMessage({ groupId: "g1", content: "hello", relayHint: relay }).kind, KIND_CHAT_MESSAGE)
})

Deno.test("buildGroupChatMessage writes the content as given", () => {
  assertEquals(buildGroupChatMessage({ groupId: "g1", content: "hello", relayHint: relay }).content, "hello")
})

Deno.test("buildGroupChatMessage writes the h tag with the relay hint", () => {
  assertEquals(buildGroupChatMessage({ groupId: "g1", content: "hello", relayHint: relay }).tags, [["h", "g1", relay]])
})

Deno.test("buildGroupChatMessage - refuses, at compile time, null as a second spelling of an absent hint (ADR-0033)", () => {
  const input: Parameters<typeof buildGroupChatMessage>[0] = {
    groupId: "g1",
    content: "hello",
    // @ts-expect-error: an absent hint is left out, never null
    relayHint: null,
  }
  assertEquals(input.relayHint, null)
})

Deno.test("buildGroupChatMessage throws for the empty group id, which names no group (shared ADR-0101)", () => {
  assertThrows(() => buildGroupChatMessage({ groupId: "", content: "hi" }), InvalidArgumentError)
})

Deno.test("buildGroupChatMessage omits the hint when no relay is known", () => {
  const event = buildGroupChatMessage({ groupId: "g1", content: "hi" })
  assertEquals(event.tags, [["h", "g1"]])
})

Deno.test("a group chat reply is the core reply with the group's h tag added (shared ADR-0076)", () => {
  const parent = buildEventFixture({ kind: KIND_CHAT_MESSAGE, tags: [["h", "g1", relay]] })
  assertEquals(withGroupTag(buildReply("re: hi", parent, relay), parent, relay).tags, [
    ["q", parent.id, relay, parent.pubkey],
    ["h", "g1", relay],
  ])
})

Deno.test("buildGroupChatMessage takes no parent: a reply is built by buildReply (shared ADR-0076)", () => {
  // @ts-expect-error: a group chat reply is the core reply with the group's h tag added, not this builder's input
  assertEquals(buildGroupChatMessage({ groupId: "g1", content: "hi", replyTo: null }).tags, [["h", "g1"]])
})

Deno.test("buildGroupChatMessage writes the pinned created_at", () => {
  assertEquals(buildGroupChatMessage({ groupId: "g1", content: "hi", createdAt: 1700000000 }).created_at, 1700000000)
})

Deno.test("buildGroupChatMessage - tags a hashtag in its content after the group tag, as every content builder does", () => {
  const message = buildGroupChatMessage({ groupId: "g1", content: "hello #garden", relayHint: relay, createdAt: 1 })
  assertEquals(message.tags, [["h", "g1", relay], ["t", "garden"]])
})

Deno.test("buildGroupChatMessage - tags a profile its content mentions", () => {
  const message = buildGroupChatMessage({
    groupId: "g1",
    content: "hi nostr:npub1zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zygse4sl3h",
    createdAt: 1,
  })
  assertEquals(message.tags[1], ["p", "1".repeat(64)])
})
