import { assertEquals } from "@std/assert"
import {
  isRepostKind,
  isValidKind,
  KIND_APP_CURATION_SET,
  KIND_APPLICATION_SPECIFIC_DATA,
  KIND_AUTHORED_PODCASTS_LIST,
  KIND_BADGE_AWARD,
  KIND_BADGE_DEFINITION,
  KIND_BADGE_SET,
  KIND_CALENDAR_EVENT_DATE,
  KIND_CALENDAR_EVENT_RSVP,
  KIND_CALENDAR_EVENT_TIME,
  KIND_CASHU_MINT_ANNOUNCEMENT,
  KIND_CASHU_RESERVED_TOKENS,
  KIND_CASHU_WALLET,
  KIND_CASHU_WALLET_HISTORY,
  KIND_CASHU_WALLET_TOKENS,
  KIND_CHAT_MESSAGE,
  KIND_COMMENT,
  KIND_COMMUNITY_DEFINITION,
  KIND_COMMUNITY_POST_APPROVAL,
  KIND_CONFERENCE_EVENT,
  KIND_DM_RELAY_LIST,
  KIND_EPHEMERAL_GIFT_WRAP,
  KIND_EVENT_DELETION,
  KIND_EXTERNAL_IDENTITIES,
  KIND_FAVOURITE_FOLLOW_SETS_LIST,
  KIND_FAVOURITE_PODCASTS_LIST,
  KIND_FEDIMINT_ANNOUNCEMENT,
  KIND_FILE_MESSAGE,
  KIND_FOLLOW_LIST,
  KIND_FOLLOW_SET,
  KIND_GENERIC_REPOST,
  KIND_GIFT_WRAP,
  KIND_GOOD_WIKI_AUTHORS_LIST,
  KIND_GOOD_WIKI_RELAYS_LIST,
  KIND_GROUP_METADATA,
  KIND_HANDLER_INFORMATION,
  KIND_HANDLER_RECOMMENDATION,
  KIND_HIGHLIGHT,
  KIND_INTERACTIVE_ROOM,
  KIND_LIVE_CHAT_MESSAGE,
  KIND_LIVE_EVENT,
  KIND_LONGFORM_CONTENT,
  KIND_LONGFORM_CONTENT_DRAFT,
  KIND_MEDIA_STARTER_PACK,
  KIND_METADATA,
  KIND_MUTE_LIST,
  KIND_NUTZAP,
  KIND_NUTZAP_MINT_RECOMMENDATION,
  KIND_OPENTIMESTAMPS,
  KIND_PICTURE,
  KIND_POLL,
  KIND_POLL_RESPONSE,
  KIND_PROFILE_BADGES,
  KIND_REACTION,
  KIND_RELAY_DISCOVERY,
  KIND_RELAY_FEEDS_LIST,
  KIND_RELAY_LIST,
  KIND_RELAY_MONITOR_ANNOUNCEMENT,
  KIND_REPOST,
  KIND_ROOM_PRESENCE,
  KIND_SHORT_FORM_VIDEO_ADDRESSABLE,
  KIND_TEXT_NOTE,
  KIND_THREAD,
  KIND_USER_STATUS,
  KIND_VANISH_REQUEST,
  KIND_VIDEO_ADDRESSABLE,
  KIND_VOICE_MESSAGE,
  KIND_VOICE_MESSAGE_COMMENT,
  KIND_WALLET_INFO,
  KIND_WALLET_REQUEST,
  KIND_WALLET_RESPONSE,
  KIND_WEBSITE_REACTION,
  KIND_WIKI_ARTICLE,
  KIND_WIKI_REDIRECT,
  KIND_ZAP_GOAL,
  KIND_ZAP_RECEIPT,
  KIND_ZAP_REQUEST,
  kindCategory,
  REPOST_KINDS,
} from "../../src/domain/value-object/kinds.ts"
import { getDTag, replaceableStorageKey, replaceableSupersedes } from "../../src/domain/service/replaceable.ts"
import { eventIdFixture, publicKeyFixture } from "../../testing.ts"

const PK = publicKeyFixture("a".repeat(64))

Deno.test("KIND_* - names each kind added to match innis/nostr-core's EventKind, by its value (shared ADR-0109)", () => {
  assertEquals(
    [
      KIND_BADGE_AWARD,
      KIND_CHAT_MESSAGE,
      KIND_THREAD,
      KIND_FILE_MESSAGE,
      KIND_WEBSITE_REACTION,
      KIND_PICTURE,
      KIND_VANISH_REQUEST,
      KIND_POLL_RESPONSE,
      KIND_OPENTIMESTAMPS,
      KIND_POLL,
      KIND_VOICE_MESSAGE,
      KIND_VOICE_MESSAGE_COMMENT,
      KIND_LIVE_CHAT_MESSAGE,
      KIND_COMMUNITY_POST_APPROVAL,
      KIND_CASHU_RESERVED_TOKENS,
      KIND_CASHU_WALLET_TOKENS,
      KIND_CASHU_WALLET_HISTORY,
      KIND_ZAP_GOAL,
      KIND_PROFILE_BADGES,
      KIND_EXTERNAL_IDENTITIES,
      KIND_RELAY_FEEDS_LIST,
      KIND_NUTZAP_MINT_RECOMMENDATION,
      KIND_GOOD_WIKI_AUTHORS_LIST,
      KIND_GOOD_WIKI_RELAYS_LIST,
      KIND_RELAY_MONITOR_ANNOUNCEMENT,
      KIND_ROOM_PRESENCE,
      KIND_WALLET_INFO,
      KIND_CASHU_WALLET,
      KIND_WALLET_REQUEST,
      KIND_WALLET_RESPONSE,
      KIND_BADGE_SET,
      KIND_BADGE_DEFINITION,
      KIND_RELAY_DISCOVERY,
      KIND_APP_CURATION_SET,
      KIND_INTERACTIVE_ROOM,
      KIND_CONFERENCE_EVENT,
      KIND_USER_STATUS,
      KIND_WIKI_ARTICLE,
      KIND_WIKI_REDIRECT,
      KIND_CALENDAR_EVENT_DATE,
      KIND_CALENDAR_EVENT_TIME,
      KIND_CALENDAR_EVENT_RSVP,
      KIND_HANDLER_RECOMMENDATION,
      KIND_HANDLER_INFORMATION,
      KIND_COMMUNITY_DEFINITION,
      KIND_CASHU_MINT_ANNOUNCEMENT,
      KIND_FEDIMINT_ANNOUNCEMENT,
      KIND_GROUP_METADATA,
      KIND_MEDIA_STARTER_PACK,
    ],
    [
      8,
      9,
      11,
      15,
      17,
      20,
      62,
      1018,
      1040,
      1068,
      1222,
      1244,
      1311,
      4550,
      7374,
      7375,
      7376,
      9041,
      10008,
      10011,
      10012,
      10019,
      10101,
      10102,
      10166,
      10312,
      13194,
      17375,
      23194,
      23195,
      30008,
      30009,
      30166,
      30267,
      30312,
      30313,
      30315,
      30818,
      30819,
      31922,
      31923,
      31925,
      31989,
      31990,
      34550,
      38172,
      38173,
      39000,
      39092,
    ],
  )
})

Deno.test("KIND_METADATA - equals 0", () => {
  assertEquals(KIND_METADATA, 0)
})

Deno.test("KIND_TEXT_NOTE - equals 1", () => {
  assertEquals(KIND_TEXT_NOTE, 1)
})

Deno.test("KIND_FOLLOW_LIST - equals 3", () => {
  assertEquals(KIND_FOLLOW_LIST, 3)
})

Deno.test("KIND_EVENT_DELETION - equals 5", () => {
  assertEquals(KIND_EVENT_DELETION, 5)
})

Deno.test("KIND_REPOST - equals 6", () => {
  assertEquals(KIND_REPOST, 6)
})

Deno.test("KIND_REACTION - equals 7", () => {
  assertEquals(KIND_REACTION, 7)
})

Deno.test("KIND_GENERIC_REPOST - equals 16", () => {
  assertEquals(KIND_GENERIC_REPOST, 16)
})

Deno.test("KIND_GIFT_WRAP - equals 1059", () => {
  assertEquals(KIND_GIFT_WRAP, 1059)
})

Deno.test("KIND_EPHEMERAL_GIFT_WRAP - equals 21059", () => {
  assertEquals(KIND_EPHEMERAL_GIFT_WRAP, 21059)
})

Deno.test("KIND_COMMENT - equals 1111", () => {
  assertEquals(KIND_COMMENT, 1111)
})

Deno.test("KIND_MUTE_LIST - equals 10000", () => {
  assertEquals(KIND_MUTE_LIST, 10000)
})

Deno.test("KIND_FAVOURITE_FOLLOW_SETS_LIST - equals 10021, the NIP-51 favourite follow sets list", () => {
  assertEquals(KIND_FAVOURITE_FOLLOW_SETS_LIST, 10021)
})

Deno.test("KIND_FAVOURITE_PODCASTS_LIST - equals 10054, the NIP-51 favourite podcasts list", () => {
  assertEquals(KIND_FAVOURITE_PODCASTS_LIST, 10054)
})

Deno.test("KIND_AUTHORED_PODCASTS_LIST - equals 10064, the NIP-51 authored podcasts list", () => {
  assertEquals(KIND_AUTHORED_PODCASTS_LIST, 10064)
})

Deno.test("KIND_RELAY_LIST - equals 10002", () => {
  assertEquals(KIND_RELAY_LIST, 10002)
})

Deno.test("KIND_APPLICATION_SPECIFIC_DATA - equals 30078", () => {
  assertEquals(KIND_APPLICATION_SPECIFIC_DATA, 30078)
})

Deno.test("KIND_DM_RELAY_LIST - equals 10050", () => {
  assertEquals(KIND_DM_RELAY_LIST, 10050)
})

Deno.test("KIND_FOLLOW_SET - equals 30000", () => {
  assertEquals(KIND_FOLLOW_SET, 30000)
})

Deno.test("KIND_LONGFORM_CONTENT - equals 30023", () => {
  assertEquals(KIND_LONGFORM_CONTENT, 30023)
})

Deno.test("KIND_LONGFORM_CONTENT_DRAFT - equals 30024", () => {
  assertEquals(KIND_LONGFORM_CONTENT_DRAFT, 30024)
})

Deno.test("KIND_ZAP_RECEIPT - equals 9735", () => {
  assertEquals(KIND_ZAP_RECEIPT, 9735)
})

Deno.test("KIND_ZAP_REQUEST - equals 9734", () => {
  assertEquals(KIND_ZAP_REQUEST, 9734)
})

Deno.test("KIND_NUTZAP - equals 9321", () => {
  assertEquals(KIND_NUTZAP, 9321)
})

Deno.test("KIND_HIGHLIGHT - equals 9802", () => {
  assertEquals(KIND_HIGHLIGHT, 9802)
})

Deno.test("KIND_LIVE_EVENT - equals 30311", () => {
  assertEquals(KIND_LIVE_EVENT, 30311)
})

Deno.test("KIND_VIDEO_ADDRESSABLE - equals 34235", () => {
  assertEquals(KIND_VIDEO_ADDRESSABLE, 34235)
})

Deno.test("KIND_SHORT_FORM_VIDEO_ADDRESSABLE - equals 34236", () => {
  assertEquals(KIND_SHORT_FORM_VIDEO_ADDRESSABLE, 34236)
})

Deno.test("kindCategory - kinds 0 and 3 and the 10000 range are replaceable (NIP-01)", () => {
  assertEquals([KIND_METADATA, KIND_FOLLOW_LIST, 10000, 15000, 19999].map(kindCategory), [
    "replaceable",
    "replaceable",
    "replaceable",
    "replaceable",
    "replaceable",
  ])
})

Deno.test("kindCategory - the 20000 range is ephemeral (NIP-01)", () => {
  assertEquals([20000, 22242, 29999].map(kindCategory), ["ephemeral", "ephemeral", "ephemeral"])
})

Deno.test("kindCategory - the 30000 range is addressable (NIP-01)", () => {
  assertEquals([30000, KIND_LONGFORM_CONTENT, 39999].map(kindCategory), ["addressable", "addressable", "addressable"])
})

Deno.test("kindCategory - NIP-01's regular bands are regular", () => {
  assertEquals([1, 2, 4, 44, 1000, 9999].map(kindCategory), [
    "regular",
    "regular",
    "regular",
    "regular",
    "regular",
    "regular",
  ])
})

Deno.test("kindCategory - kinds outside every NIP-01 band default to regular", () => {
  assertEquals([45, 443, 999, 40000, 65535].map(kindCategory), ["regular", "regular", "regular", "regular", "regular"])
})

Deno.test("REPOST_KINDS - contains repost and generic repost", () => {
  assertEquals(REPOST_KINDS.includes(KIND_REPOST), true)
  assertEquals(REPOST_KINDS.includes(KIND_GENERIC_REPOST), true)
  assertEquals(REPOST_KINDS.length, 2)
})

Deno.test("isRepostKind - true for KIND_REPOST", () => {
  assertEquals(isRepostKind(KIND_REPOST), true)
})

Deno.test("isRepostKind - true for KIND_GENERIC_REPOST", () => {
  assertEquals(isRepostKind(KIND_GENERIC_REPOST), true)
})

Deno.test("isRepostKind - false for unrelated kinds", () => {
  assertEquals(isRepostKind(KIND_TEXT_NOTE), false)
  assertEquals(isRepostKind(KIND_REACTION), false)
})

const makeEvent = (
  kind: number,
  pubkey: typeof PK,
  tags: ReadonlyArray<readonly [string, ...string[]]> = [],
) => ({ pubkey, kind, tags })

Deno.test("replaceableStorageKey - returns pubkey:kind for replaceable kind 0", () => {
  const event = makeEvent(KIND_METADATA, PK)
  assertEquals(replaceableStorageKey(event), `${PK}:0`)
})

Deno.test("replaceableStorageKey - returns pubkey:kind for replaceable kind 3", () => {
  const event = makeEvent(KIND_FOLLOW_LIST, PK)
  assertEquals(replaceableStorageKey(event), `${PK}:3`)
})

Deno.test("replaceableStorageKey - returns pubkey:kind for replaceable range kind 10002", () => {
  const event = makeEvent(10002, PK)
  assertEquals(replaceableStorageKey(event), `${PK}:10002`)
})

Deno.test("replaceableStorageKey - returns pubkey:kind:dTag for an addressable event", () => {
  const event = makeEvent(KIND_FOLLOW_SET, PK, [["d", "my-list"]])
  assertEquals(replaceableStorageKey(event), `${PK}:30000:my-list`)
})

Deno.test("replaceableStorageKey - defaults dTag to empty string when missing", () => {
  const event = makeEvent(KIND_LONGFORM_CONTENT, PK)
  assertEquals(replaceableStorageKey(event), `${PK}:30023:`)
})

Deno.test("replaceableStorageKey - returns null for an addressable event whose d tags disagree (shared ADR-0014)", () => {
  const event = makeEvent(KIND_LONGFORM_CONTENT, PK, [["d", "a"], ["d", "b"]])
  assertEquals(replaceableStorageKey(event), null)
})

Deno.test("replaceableStorageKey - returns null for regular events", () => {
  const event = makeEvent(KIND_TEXT_NOTE, PK)
  assertEquals(replaceableStorageKey(event), null)
})

Deno.test("replaceableStorageKey - returns null for kind outside replaceable ranges", () => {
  const event = makeEvent(5, PK)
  assertEquals(replaceableStorageKey(event), null)
})

const LOW_ID = eventIdFixture("11".padEnd(64, "0"))
const HIGH_ID = eventIdFixture("22".padEnd(64, "0"))

Deno.test("replaceableSupersedes - a strictly newer candidate supersedes", () => {
  assertEquals(replaceableSupersedes({ id: HIGH_ID, created_at: 2000 }, { id: LOW_ID, created_at: 1000 }), true)
})

Deno.test("replaceableSupersedes - a strictly older candidate does not supersede", () => {
  assertEquals(replaceableSupersedes({ id: LOW_ID, created_at: 1000 }, { id: HIGH_ID, created_at: 2000 }), false)
})

Deno.test("replaceableSupersedes - on a created_at tie the lexicographically lower id wins (NIP-01)", () => {
  assertEquals(replaceableSupersedes({ id: LOW_ID, created_at: 1000 }, { id: HIGH_ID, created_at: 1000 }), true)
  assertEquals(replaceableSupersedes({ id: HIGH_ID, created_at: 1000 }, { id: LOW_ID, created_at: 1000 }), false)
})

Deno.test("replaceableSupersedes - an identical event does not supersede itself", () => {
  assertEquals(replaceableSupersedes({ id: LOW_ID, created_at: 1000 }, { id: LOW_ID, created_at: 1000 }), false)
})

Deno.test("getDTag - returns the d tag value", () => {
  assertEquals(getDTag([["d", "settings"]]), "settings")
})

Deno.test("getDTag - returns the empty string when there is no d tag", () => {
  assertEquals(getDTag([["p", "x"]]), "")
})

Deno.test("getDTag - reads a repeated identical d tag as one identifier (shared ADR-0014)", () => {
  assertEquals(getDTag([["d", "x"], ["d", "x"]]), "x")
})

Deno.test("getDTag - returns null when d tags disagree, since the event names no one identifier (shared ADR-0014)", () => {
  assertEquals(getDTag([["d", "x"], ["d", "y"]]), null)
})

Deno.test("isValidKind - accepts NIP-01's 0 and 65535", () => {
  assertEquals([0, 65535].map(isValidKind), [true, true])
})

Deno.test("isValidKind - refuses a kind above 65535, a negative, a fraction and a non-number", () => {
  assertEquals([65536, -1, 1.5, "1", null].map(isValidKind), [false, false, false, false, false])
})
