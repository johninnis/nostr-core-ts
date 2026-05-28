import { assertEquals } from "@std/assert"
import {
  KIND_APP_SETTINGS,
  KIND_COMMENT,
  KIND_CONTACT_LIST,
  KIND_CURATED_SET,
  KIND_DELETION,
  KIND_DM_RELAY_LIST,
  KIND_GENERIC_REPOST,
  KIND_GIFT_WRAP,
  KIND_HIGHLIGHT,
  KIND_LIVE_EVENT,
  KIND_LONGFORM,
  KIND_LONGFORM_DRAFT,
  KIND_METADATA,
  KIND_MUTE_LIST,
  KIND_NUTZAP,
  KIND_PEOPLE_SET,
  KIND_REACTION,
  KIND_RELAY_LIST,
  KIND_REPOST,
  KIND_SHORT_NOTE,
  KIND_VIDEO_HORIZONTAL,
  KIND_VIDEO_VERTICAL,
  KIND_ZAP_RECEIPT,
  KIND_ZAP_REQUEST,
} from "../../src/domain/value-object/kinds.ts"
import {
  isParameterisedReplaceable,
  isReplaceable,
  isRepostKind,
  REPOST_KINDS,
} from "../../src/domain/service/kinds.ts"
import { replaceableStorageKey } from "../../src/domain/service/replaceable.ts"
import { parsePublicKey } from "../../src/domain/value-object/public-key.ts"

const PK = parsePublicKey("a".repeat(64))

Deno.test("KIND_METADATA - equals 0", () => {
  assertEquals(KIND_METADATA, 0)
})

Deno.test("KIND_SHORT_NOTE - equals 1", () => {
  assertEquals(KIND_SHORT_NOTE, 1)
})

Deno.test("KIND_CONTACT_LIST - equals 3", () => {
  assertEquals(KIND_CONTACT_LIST, 3)
})

Deno.test("KIND_DELETION - equals 5", () => {
  assertEquals(KIND_DELETION, 5)
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

Deno.test("KIND_COMMENT - equals 1111", () => {
  assertEquals(KIND_COMMENT, 1111)
})

Deno.test("KIND_CURATED_SET - equals 1068", () => {
  assertEquals(KIND_CURATED_SET, 1068)
})

Deno.test("KIND_MUTE_LIST - equals 10000", () => {
  assertEquals(KIND_MUTE_LIST, 10000)
})

Deno.test("KIND_RELAY_LIST - equals 10002", () => {
  assertEquals(KIND_RELAY_LIST, 10002)
})

Deno.test("KIND_APP_SETTINGS - equals 30078", () => {
  assertEquals(KIND_APP_SETTINGS, 30078)
})

Deno.test("KIND_DM_RELAY_LIST - equals 10050", () => {
  assertEquals(KIND_DM_RELAY_LIST, 10050)
})

Deno.test("KIND_PEOPLE_SET - equals 30000", () => {
  assertEquals(KIND_PEOPLE_SET, 30000)
})

Deno.test("KIND_LONGFORM - equals 30023", () => {
  assertEquals(KIND_LONGFORM, 30023)
})

Deno.test("KIND_LONGFORM_DRAFT - equals 30024", () => {
  assertEquals(KIND_LONGFORM_DRAFT, 30024)
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

Deno.test("KIND_VIDEO_HORIZONTAL - equals 34235", () => {
  assertEquals(KIND_VIDEO_HORIZONTAL, 34235)
})

Deno.test("KIND_VIDEO_VERTICAL - equals 34236", () => {
  assertEquals(KIND_VIDEO_VERTICAL, 34236)
})

Deno.test("isReplaceable - returns true for KIND_METADATA", () => {
  assertEquals(isReplaceable(KIND_METADATA), true)
})

Deno.test("isReplaceable - returns true for KIND_CONTACT_LIST", () => {
  assertEquals(isReplaceable(KIND_CONTACT_LIST), true)
})

Deno.test("isReplaceable - returns true for kind 10000", () => {
  assertEquals(isReplaceable(10000), true)
})

Deno.test("isReplaceable - returns true for kind 19999", () => {
  assertEquals(isReplaceable(19999), true)
})

Deno.test("isReplaceable - returns true for kind 15000 (mid-range)", () => {
  assertEquals(isReplaceable(15000), true)
})

Deno.test("isReplaceable - returns false for KIND_SHORT_NOTE", () => {
  assertEquals(isReplaceable(KIND_SHORT_NOTE), false)
})

Deno.test("isReplaceable - returns false for kind 9999", () => {
  assertEquals(isReplaceable(9999), false)
})

Deno.test("isReplaceable - returns false for kind 20000", () => {
  assertEquals(isReplaceable(20000), false)
})

Deno.test("isReplaceable - returns false for parameterised replaceable kinds", () => {
  assertEquals(isReplaceable(30000), false)
})

Deno.test("isParameterisedReplaceable - returns true for kind 30000", () => {
  assertEquals(isParameterisedReplaceable(30000), true)
})

Deno.test("isParameterisedReplaceable - returns true for kind 39999", () => {
  assertEquals(isParameterisedReplaceable(39999), true)
})

Deno.test("isParameterisedReplaceable - returns true for KIND_LONGFORM", () => {
  assertEquals(isParameterisedReplaceable(KIND_LONGFORM), true)
})

Deno.test("isParameterisedReplaceable - returns false for kind 29999", () => {
  assertEquals(isParameterisedReplaceable(29999), false)
})

Deno.test("isParameterisedReplaceable - returns false for kind 40000", () => {
  assertEquals(isParameterisedReplaceable(40000), false)
})

Deno.test("isParameterisedReplaceable - returns false for KIND_SHORT_NOTE", () => {
  assertEquals(isParameterisedReplaceable(KIND_SHORT_NOTE), false)
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
  assertEquals(isRepostKind(KIND_SHORT_NOTE), false)
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
  const event = makeEvent(KIND_CONTACT_LIST, PK)
  assertEquals(replaceableStorageKey(event), `${PK}:3`)
})

Deno.test("replaceableStorageKey - returns pubkey:kind for replaceable range kind 10002", () => {
  const event = makeEvent(10002, PK)
  assertEquals(replaceableStorageKey(event), `${PK}:10002`)
})

Deno.test("replaceableStorageKey - returns pubkey:kind:dTag for parameterised replaceable", () => {
  const event = makeEvent(KIND_PEOPLE_SET, PK, [["d", "my-list"]])
  assertEquals(replaceableStorageKey(event), `${PK}:30000:my-list`)
})

Deno.test("replaceableStorageKey - defaults dTag to empty string when missing", () => {
  const event = makeEvent(KIND_LONGFORM, PK)
  assertEquals(replaceableStorageKey(event), `${PK}:30023:`)
})

Deno.test("replaceableStorageKey - returns null for regular events", () => {
  const event = makeEvent(KIND_SHORT_NOTE, PK)
  assertEquals(replaceableStorageKey(event), null)
})

Deno.test("replaceableStorageKey - returns null for kind outside replaceable ranges", () => {
  const event = makeEvent(5, PK)
  assertEquals(replaceableStorageKey(event), null)
})
