import { assertEquals, assertExists } from "@std/assert"
import {
  decodeNostrEntity,
  encodeEventIdToNote,
  encodeNaddr,
  encodeNevent,
  encodeNprofile,
  encodePubkeyToNpub,
  NOSTR_ENTITY_REGEX,
  pubkeyFromNip19,
  stripNostrUriPrefix,
} from "../../src/domain/service/bech32.ts"
import { parseEventId } from "../../src/domain/value-object/event-id.ts"
import { parsePublicKey } from "../../src/domain/value-object/public-key.ts"

const VALID_HEX_PUBKEY = parsePublicKey("3bf0c63fcb93463407af97a5e5ee64fa883d107ef9e558472c4eb9aaaefa459d")
const VALID_HEX_EVENT = parseEventId("4a5e1e4baab89f3a32518a88c31bc87f618f76673e2cc77ab2127b7afdeda33b")

Deno.test("encodePubkeyToNpub - produces npub1 prefixed string", () => {
  const npub = encodePubkeyToNpub(VALID_HEX_PUBKEY)
  assertEquals(npub.startsWith("npub1"), true)
})

Deno.test("encodePubkeyToNpub - decodes back to original pubkey", () => {
  const npub = encodePubkeyToNpub(VALID_HEX_PUBKEY)
  const decoded = decodeNostrEntity(npub)
  assertExists(decoded)
  assertEquals(decoded.type, "npub")
  if (decoded.type === "npub") assertEquals(decoded.pubkey, VALID_HEX_PUBKEY)
})

Deno.test("encodeEventIdToNote - produces note1 prefixed string", () => {
  const note = encodeEventIdToNote(VALID_HEX_EVENT)
  assertEquals(note.startsWith("note1"), true)
})

Deno.test("encodeEventIdToNote - decodes back to original event ID", () => {
  const note = encodeEventIdToNote(VALID_HEX_EVENT)
  const decoded = decodeNostrEntity(note)
  assertExists(decoded)
  assertEquals(decoded.type, "note")
  if (decoded.type === "note") assertEquals(decoded.eventId, VALID_HEX_EVENT)
})

Deno.test("decodeNostrEntity - decodes npub", () => {
  const npub = encodePubkeyToNpub(VALID_HEX_PUBKEY)
  const decoded = decodeNostrEntity(npub)
  assertExists(decoded)
  assertEquals(decoded.type, "npub")
  if (decoded.type === "npub") assertEquals(decoded.pubkey, VALID_HEX_PUBKEY)
})

Deno.test("decodeNostrEntity - decodes note", () => {
  const note = encodeEventIdToNote(VALID_HEX_EVENT)
  const decoded = decodeNostrEntity(note)
  assertExists(decoded)
  assertEquals(decoded.type, "note")
  if (decoded.type === "note") assertEquals(decoded.eventId, VALID_HEX_EVENT)
})

Deno.test("decodeNostrEntity - decodes nprofile", () => {
  const nprofile = encodeNprofile(VALID_HEX_PUBKEY, ["wss://relay.damus.io"])
  const decoded = decodeNostrEntity(nprofile)
  assertExists(decoded)
  assertEquals(decoded.type, "nprofile")
  if (decoded.type === "nprofile") {
    assertEquals(decoded.pubkey, VALID_HEX_PUBKEY)
    assertEquals(decoded.relays.length, 1)
    assertEquals(decoded.relays[0], "wss://relay.damus.io")
  }
})

Deno.test("decodeNostrEntity - decodes nprofile without relays", () => {
  const nprofile = encodeNprofile(VALID_HEX_PUBKEY)
  const decoded = decodeNostrEntity(nprofile)
  assertExists(decoded)
  assertEquals(decoded.type, "nprofile")
  if (decoded.type === "nprofile") assertEquals(decoded.relays.length, 0)
})

Deno.test("decodeNostrEntity - decodes nevent", () => {
  const nevent = encodeNevent(VALID_HEX_EVENT, { relayUrls: ["wss://nos.lol"], authorPubkey: VALID_HEX_PUBKEY })
  const decoded = decodeNostrEntity(nevent)
  assertExists(decoded)
  assertEquals(decoded.type, "nevent")
  if (decoded.type === "nevent") {
    assertEquals(decoded.eventId, VALID_HEX_EVENT)
    assertEquals(decoded.relays.length, 1)
    assertEquals(decoded.relays[0], "wss://nos.lol")
    assertEquals(decoded.pubkey, VALID_HEX_PUBKEY)
  }
})

Deno.test("decodeNostrEntity - decodes nevent without author", () => {
  const nevent = encodeNevent(VALID_HEX_EVENT)
  const decoded = decodeNostrEntity(nevent)
  assertExists(decoded)
  assertEquals(decoded.type, "nevent")
  if (decoded.type === "nevent") assertEquals(decoded.pubkey, null)
})

Deno.test("decodeNostrEntity - decodes naddr", () => {
  const naddr = encodeNaddr({ kind: 30023, pubkey: VALID_HEX_PUBKEY, dTag: "my-article" }, ["wss://relay.damus.io"])
  const decoded = decodeNostrEntity(naddr)
  assertExists(decoded)
  assertEquals(decoded.type, "naddr")
  if (decoded.type === "naddr") {
    assertEquals(decoded.dTag, "my-article")
    assertEquals(decoded.pubkey, VALID_HEX_PUBKEY)
    assertEquals(decoded.kind, 30023)
    assertEquals(decoded.relays.length, 1)
  }
})

Deno.test("decodeNostrEntity - decodes naddr without relays", () => {
  const naddr = encodeNaddr({ kind: 30023, pubkey: VALID_HEX_PUBKEY, dTag: "slug" })
  const decoded = decodeNostrEntity(naddr)
  assertExists(decoded)
  assertEquals(decoded.type, "naddr")
  if (decoded.type === "naddr") assertEquals(decoded.relays.length, 0)
})

Deno.test("decodeNostrEntity - strips nostr: prefix", () => {
  const npub = encodePubkeyToNpub(VALID_HEX_PUBKEY)
  const decoded = decodeNostrEntity("nostr:" + npub)
  assertExists(decoded)
  assertEquals(decoded.type, "npub")
  if (decoded.type === "npub") assertEquals(decoded.pubkey, VALID_HEX_PUBKEY)
})

Deno.test("decodeNostrEntity - returns null for invalid input", () => {
  assertEquals(decodeNostrEntity("not-a-nostr-entity"), null)
})

Deno.test("decodeNostrEntity - returns null for empty string", () => {
  assertEquals(decodeNostrEntity(""), null)
})

Deno.test("encodeNprofile - produces nprofile1 prefixed string", () => {
  const result = encodeNprofile(VALID_HEX_PUBKEY)
  assertEquals(result.startsWith("nprofile1"), true)
})

Deno.test("encodeNprofile - includes multiple relays", () => {
  const relays = ["wss://relay.damus.io", "wss://nos.lol"]
  const nprofile = encodeNprofile(VALID_HEX_PUBKEY, relays)
  const decoded = decodeNostrEntity(nprofile)
  assertExists(decoded)
  assertEquals(decoded.type, "nprofile")
  if (decoded.type === "nprofile") assertEquals(decoded.relays.length, 2)
})

Deno.test("encodeNevent - produces nevent1 prefixed string", () => {
  const result = encodeNevent(VALID_HEX_EVENT)
  assertEquals(result.startsWith("nevent1"), true)
})

Deno.test("encodeNaddr - produces naddr1 prefixed string", () => {
  const result = encodeNaddr({ kind: 30023, pubkey: VALID_HEX_PUBKEY, dTag: "test" })
  assertEquals(result.startsWith("naddr1"), true)
})

Deno.test("encodeNaddr - handles empty d tag", () => {
  const naddr = encodeNaddr({ kind: 30023, pubkey: VALID_HEX_PUBKEY, dTag: "" })
  const decoded = decodeNostrEntity(naddr)
  assertExists(decoded)
  assertEquals(decoded.type, "naddr")
  if (decoded.type === "naddr") assertEquals(decoded.dTag, "")
})

Deno.test("stripNostrUriPrefix - removes lowercase nostr: prefix", () => {
  assertEquals(stripNostrUriPrefix("nostr:npub1abc"), "npub1abc")
})

Deno.test("stripNostrUriPrefix - removes uppercase NOSTR: prefix", () => {
  assertEquals(stripNostrUriPrefix("NOSTR:npub1abc"), "npub1abc")
})

Deno.test("stripNostrUriPrefix - trims surrounding whitespace", () => {
  assertEquals(stripNostrUriPrefix("  nostr:npub1abc  "), "npub1abc")
})

Deno.test("stripNostrUriPrefix - returns input unchanged when no prefix", () => {
  assertEquals(stripNostrUriPrefix("npub1abc"), "npub1abc")
})

Deno.test("stripNostrUriPrefix - returns empty string for empty input", () => {
  assertEquals(stripNostrUriPrefix(""), "")
})

Deno.test("pubkeyFromNip19 - decodes npub to its hex PublicKey", () => {
  const npub = encodePubkeyToNpub(VALID_HEX_PUBKEY)
  assertEquals(pubkeyFromNip19(npub), VALID_HEX_PUBKEY)
})

Deno.test("pubkeyFromNip19 - decodes nprofile to its hex PublicKey", () => {
  const nprofile = encodeNprofile(VALID_HEX_PUBKEY)
  assertEquals(pubkeyFromNip19(nprofile), VALID_HEX_PUBKEY)
})

Deno.test("pubkeyFromNip19 - returns null for null input", () => {
  assertEquals(pubkeyFromNip19(null), null)
})

Deno.test("pubkeyFromNip19 - returns null for empty string", () => {
  assertEquals(pubkeyFromNip19(""), null)
})

Deno.test("pubkeyFromNip19 - returns null for unparseable input", () => {
  assertEquals(pubkeyFromNip19("not-an-npub"), null)
})

Deno.test("pubkeyFromNip19 - returns null for note1 (no pubkey)", () => {
  const note = encodeEventIdToNote(VALID_HEX_EVENT)
  assertEquals(pubkeyFromNip19(note), null)
})

Deno.test("NOSTR_ENTITY_REGEX - captures a bare npub embedded in text", () => {
  const npub = encodePubkeyToNpub(VALID_HEX_PUBKEY)
  const text = `hello ${npub} world`
  const matches = [...text.matchAll(NOSTR_ENTITY_REGEX)]
  assertEquals(matches.length, 1)
  assertEquals(matches[0]?.[1], npub)
})

Deno.test("NOSTR_ENTITY_REGEX - captures the bech32 group without the nostr: prefix", () => {
  const npub = encodePubkeyToNpub(VALID_HEX_PUBKEY)
  const text = `see nostr:${npub} for details`
  const matches = [...text.matchAll(NOSTR_ENTITY_REGEX)]
  assertEquals(matches[0]?.[1], npub)
})

Deno.test("NOSTR_ENTITY_REGEX - finds multiple distinct entities in one body", () => {
  const npub = encodePubkeyToNpub(VALID_HEX_PUBKEY)
  const note = encodeEventIdToNote(VALID_HEX_EVENT)
  const text = `${npub} then later ${note}`
  const found = [...text.matchAll(NOSTR_ENTITY_REGEX)].map((m) => m[1])
  assertEquals(found, [npub, note])
})
