import { assertEquals } from "@std/assert"
import { groupChatFilter, groupMetadataFilter, parseGroupMetadata } from "../../src/domain/service/group.ts"
import { KIND_CHAT_MESSAGE, KIND_GROUP_METADATA } from "../../src/domain/value-object/kinds.ts"
import { buildEventFixture, publicKeyFixture, relayUrlFixture } from "../../testing.ts"

const relay = relayUrlFixture("wss://groups.example.com")

Deno.test("groupMetadataFilter matches every group when no id is given", () => {
  assertEquals(groupMetadataFilter(), { kinds: [KIND_GROUP_METADATA] })
})

Deno.test("groupMetadataFilter scopes to one group by d tag when given an id", () => {
  assertEquals(groupMetadataFilter("abcdef"), { kinds: [KIND_GROUP_METADATA], "#d": ["abcdef"] })
})

Deno.test("groupMetadataFilter scopes to the empty id it is given, never widening to every group (ADR-0033)", () => {
  assertEquals(groupMetadataFilter(""), { kinds: [KIND_GROUP_METADATA], "#d": [""] })
})

Deno.test("groupChatFilter matches kind 9 messages by h tag", () => {
  assertEquals(groupChatFilter("abcdef"), { kinds: [KIND_CHAT_MESSAGE], "#h": ["abcdef"] })
})

Deno.test("parseGroupMetadata derives a group from a full kind 39000 event", () => {
  const event = buildEventFixture({
    kind: KIND_GROUP_METADATA,
    tags: [
      ["d", "abcdef"],
      ["name", "Cool Group"],
      ["about", "A place to chat"],
      ["picture", "https://example.com/pic.png"],
      ["private"],
      ["closed"],
      ["restricted"],
      ["hidden"],
    ],
  })

  assertEquals(parseGroupMetadata(event, relay), {
    id: "abcdef",
    relay,
    name: "Cool Group",
    about: "A place to chat",
    picture: "https://example.com/pic.png",
    isPublic: false,
    isOpen: false,
    isRestricted: true,
    isHidden: true,
    isLiveAvSpace: false,
  })
})

Deno.test("parseGroupMetadata flags a livekit-tagged group as a live AV space", () => {
  const event = buildEventFixture({ kind: KIND_GROUP_METADATA, tags: [["d", "g1"], ["name", "Voices"], ["livekit"]] })
  assertEquals(parseGroupMetadata(event, relay)?.isLiveAvSpace, true)
})

Deno.test("parseGroupMetadata leaves isLiveAvSpace false without a livekit tag", () => {
  const event = buildEventFixture({ kind: KIND_GROUP_METADATA, tags: [["d", "g1"]] })
  assertEquals(parseGroupMetadata(event, relay)?.isLiveAvSpace, false)
})

Deno.test("parseGroupMetadata defaults to public without a private marker", () => {
  const event = buildEventFixture({ kind: KIND_GROUP_METADATA, tags: [["d", "g1"]] })
  assertEquals(parseGroupMetadata(event, relay)?.isPublic, true)
})

Deno.test("parseGroupMetadata defaults to open without a closed marker", () => {
  const event = buildEventFixture({ kind: KIND_GROUP_METADATA, tags: [["d", "g1"]] })
  assertEquals(parseGroupMetadata(event, relay)?.isOpen, true)
})

Deno.test("parseGroupMetadata leaves isRestricted false without its marker", () => {
  const event = buildEventFixture({ kind: KIND_GROUP_METADATA, tags: [["d", "g1"]] })
  assertEquals(parseGroupMetadata(event, relay)?.isRestricted, false)
})

Deno.test("parseGroupMetadata leaves isHidden false without its marker", () => {
  const event = buildEventFixture({ kind: KIND_GROUP_METADATA, tags: [["d", "g1"]] })
  assertEquals(parseGroupMetadata(event, relay)?.isHidden, false)
})

Deno.test("parseGroupMetadata lets private and closed decide, whatever public or open tags sit beside them", () => {
  const event = buildEventFixture({
    kind: KIND_GROUP_METADATA,
    tags: [["d", "g1"], ["public"], ["private"], ["open"], ["closed"]],
  })
  const group = parseGroupMetadata(event, relay)
  assertEquals([group?.isPublic, group?.isOpen], [false, false])
})

Deno.test("parseGroupMetadata falls back to the id when no name tag is present", () => {
  const event = buildEventFixture({ kind: KIND_GROUP_METADATA, tags: [["d", "noname"]] })
  assertEquals(parseGroupMetadata(event, relay)?.name, "noname")
})

const untrimmedGroup = buildEventFixture({
  kind: KIND_GROUP_METADATA,
  tags: [["d", "g1"], ["name", " voices, test room"], ["about", "just another test room "], ["picture", " "]],
})

Deno.test("parseGroupMetadata keeps the name exactly as written, whitespace included (shared ADR-0079)", () => {
  assertEquals(parseGroupMetadata(untrimmedGroup, relay)?.name, " voices, test room")
})

Deno.test("parseGroupMetadata keeps the about text exactly as written, whitespace included (shared ADR-0079)", () => {
  assertEquals(parseGroupMetadata(untrimmedGroup, relay)?.about, "just another test room ")
})

Deno.test("parseGroupMetadata keeps a picture of whitespace alone as written, for the caller to judge (shared ADR-0079)", () => {
  assertEquals(parseGroupMetadata(untrimmedGroup, relay)?.picture, " ")
})

const emptyFieldsGroup = buildEventFixture({
  kind: KIND_GROUP_METADATA,
  tags: [["d", "g1"], ["name", ""], ["about", ""], ["picture", ""]],
})

Deno.test("parseGroupMetadata reads an empty name as the empty string, not as the id (shared ADR-0079)", () => {
  assertEquals(parseGroupMetadata(emptyFieldsGroup, relay)?.name, "")
})

Deno.test("parseGroupMetadata reads an empty about as the empty string, not absent (shared ADR-0079)", () => {
  assertEquals(parseGroupMetadata(emptyFieldsGroup, relay)?.about, "")
})

Deno.test("parseGroupMetadata reads an empty picture as the empty string, not absent (shared ADR-0079)", () => {
  assertEquals(parseGroupMetadata(emptyFieldsGroup, relay)?.picture, "")
})

Deno.test("parseGroupMetadata reads no about and no picture when no tag states them", () => {
  const group = parseGroupMetadata(buildEventFixture({ kind: KIND_GROUP_METADATA, tags: [["d", "g1"]] }), relay)
  assertEquals([group?.about, group?.picture], [null, null])
})

Deno.test("parseGroupMetadata returns null without a d tag", () => {
  const event = buildEventFixture({ kind: KIND_GROUP_METADATA, tags: [["name", "Orphan"]] })
  assertEquals(parseGroupMetadata(event, relay), null)
})

Deno.test("parseGroupMetadata reads an empty d tag like an absent one: no group id, so no group", () => {
  const event = buildEventFixture({ kind: KIND_GROUP_METADATA, tags: [["d", ""], ["name", "Orphan"]] })
  assertEquals(parseGroupMetadata(event, relay), null)
})

Deno.test("parseGroupMetadata returns null when d tags disagree, since the group has no one id", () => {
  const event = buildEventFixture({ kind: KIND_GROUP_METADATA, tags: [["d", "g1"], ["d", "g2"]] })
  assertEquals(parseGroupMetadata(event, relay), null)
})

Deno.test("parseGroupMetadata reads name, about and picture tags that disagree as absent, whatever their order", () => {
  const event = buildEventFixture({
    kind: KIND_GROUP_METADATA,
    tags: [["d", "g1"], ["name", "A"], ["about", "x"], ["picture", "p1"], ["name", "B"], ["about", "y"], [
      "picture",
      "p2",
    ]],
  })
  const group = parseGroupMetadata(event, relay)
  assertEquals([group?.name, group?.about, group?.picture], ["g1", null, null])
})

Deno.test("parseGroupMetadata returns null for the wrong kind", () => {
  const event = buildEventFixture({ kind: 1, tags: [["d", "g1"]] })
  assertEquals(parseGroupMetadata(event, relay), null)
})

Deno.test("parseGroupMetadata accepts metadata signed by the relay's own key", () => {
  const relayKey = publicKeyFixture("a".repeat(64))
  const event = buildEventFixture({ kind: KIND_GROUP_METADATA, pubkey: relayKey, tags: [["d", "abcdef"]] })

  assertEquals(parseGroupMetadata(event, relay, relayKey)?.id, "abcdef")
})

Deno.test("parseGroupMetadata refuses metadata signed by a key other than the relay's", () => {
  const event = buildEventFixture({
    kind: KIND_GROUP_METADATA,
    pubkey: publicKeyFixture("b".repeat(64)),
    tags: [["d", "abcdef"]],
  })

  assertEquals(parseGroupMetadata(event, relay, publicKeyFixture("a".repeat(64))), null)
})
