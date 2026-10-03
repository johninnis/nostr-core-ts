import { assertEquals, assertExists } from "@std/assert"
import { bech32 } from "@scure/base"
import {
  decodeNostrEntity,
  encodeEventIdToNote,
  encodeNaddr,
  encodeNevent,
  type EncodeNeventOptions,
  encodeNprofile,
  encodePubkeyToNpub,
  stripNostrUriPrefix,
} from "../../src/domain/service/bech32.ts"
import { parseHex } from "../../src/domain/service/hex.ts"
import { eventIdFixture, publicKeyFixture, relayUrlFixture } from "../../testing.ts"

const VALID_HEX_PUBKEY = publicKeyFixture("3bf0c63fcb93463407af97a5e5ee64fa883d107ef9e558472c4eb9aaaefa459d")
const VALID_HEX_EVENT = eventIdFixture("4a5e1e4baab89f3a32518a88c31bc87f618f76673e2cc77ab2127b7afdeda33b")
const EVENT_BYTES: ReadonlyArray<number> = [...parseHex(VALID_HEX_EVENT) ?? []]
const PUBKEY_BYTES: ReadonlyArray<number> = [...parseHex(VALID_HEX_PUBKEY) ?? []]
const KIND_LONGFORM_BYTES: ReadonlyArray<number> = [0, 0, 0x75, 0x47]

const encodeRaw = (hrp: string, bytes: ReadonlyArray<number>): string =>
  bech32.encode(hrp, bech32.toWords(Uint8Array.from(bytes)), false)

const tlvEntity = (hrp: string, records: ReadonlyArray<readonly [number, ReadonlyArray<number>]>): string =>
  encodeRaw(hrp, records.flatMap(([type, value]) => [type, value.length, ...value]))

const utf8 = (text: string): ReadonlyArray<number> => [...new TextEncoder().encode(text)]

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
  const nprofile = encodeNprofile(VALID_HEX_PUBKEY, [relayUrlFixture("wss://relay.damus.io")]) ?? ""
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
  const nprofile = encodeNprofile(VALID_HEX_PUBKEY) ?? ""
  const decoded = decodeNostrEntity(nprofile)
  assertExists(decoded)
  assertEquals(decoded.type, "nprofile")
  if (decoded.type === "nprofile") assertEquals(decoded.relays.length, 0)
})

Deno.test("decodeNostrEntity - decodes nevent", () => {
  const nevent =
    encodeNevent(VALID_HEX_EVENT, { relayUrls: [relayUrlFixture("wss://nos.lol")], authorPubkey: VALID_HEX_PUBKEY }) ??
      ""
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
  const nevent = encodeNevent(VALID_HEX_EVENT) ?? ""
  const decoded = decodeNostrEntity(nevent)
  assertExists(decoded)
  assertEquals(decoded.type, "nevent")
  if (decoded.type === "nevent") assertEquals(decoded.pubkey, null)
})

Deno.test("decodeNostrEntity - decodes naddr", () => {
  const naddr = encodeNaddr({ kind: 30023, pubkey: VALID_HEX_PUBKEY, dTag: "my-article" }, [
    relayUrlFixture("wss://relay.damus.io"),
  ]) ??
    ""
  const decoded = decodeNostrEntity(naddr)
  assertExists(decoded)
  assertEquals(decoded.type, "naddr")
  if (decoded.type === "naddr") {
    assertEquals(decoded.address, { kind: 30023, pubkey: VALID_HEX_PUBKEY, dTag: "my-article" })
    assertEquals(decoded.relays.length, 1)
  }
})

Deno.test("decodeNostrEntity - decodes naddr without relays", () => {
  const naddr = encodeNaddr({ kind: 30023, pubkey: VALID_HEX_PUBKEY, dTag: "slug" }) ?? ""
  const decoded = decodeNostrEntity(naddr)
  assertExists(decoded)
  assertEquals(decoded.type, "naddr")
  if (decoded.type === "naddr") assertEquals(decoded.relays.length, 0)
})

Deno.test("decodeNostrEntity - reads a bare entity only, so a nostr: URI is not one", () => {
  assertEquals(decodeNostrEntity("nostr:" + encodePubkeyToNpub(VALID_HEX_PUBKEY)), null)
})

Deno.test("decodeNostrEntity - returns null for invalid input", () => {
  assertEquals(decodeNostrEntity("not-a-nostr-entity"), null)
})

Deno.test("decodeNostrEntity - returns null for empty string", () => {
  assertEquals(decodeNostrEntity(""), null)
})

Deno.test("encodeNprofile - produces nprofile1 prefixed string", () => {
  const result = encodeNprofile(VALID_HEX_PUBKEY) ?? ""
  assertEquals(result?.startsWith("nprofile1"), true)
})

Deno.test("encodeNprofile - includes multiple relays", () => {
  const relays = [relayUrlFixture("wss://relay.damus.io"), relayUrlFixture("wss://nos.lol")]
  const nprofile = encodeNprofile(VALID_HEX_PUBKEY, relays) ?? ""
  const decoded = decodeNostrEntity(nprofile)
  assertExists(decoded)
  assertEquals(decoded.type, "nprofile")
  if (decoded.type === "nprofile") assertEquals(decoded.relays.length, 2)
})

Deno.test("encodeNevent - produces nevent1 prefixed string", () => {
  const result = encodeNevent(VALID_HEX_EVENT) ?? ""
  assertEquals(result?.startsWith("nevent1"), true)
})

Deno.test("encodeNaddr - produces naddr1 prefixed string", () => {
  const result = encodeNaddr({ kind: 30023, pubkey: VALID_HEX_PUBKEY, dTag: "test" }) ?? ""
  assertEquals(result?.startsWith("naddr1"), true)
})

Deno.test("encodeNaddr - handles empty d tag", () => {
  const naddr = encodeNaddr({ kind: 30023, pubkey: VALID_HEX_PUBKEY, dTag: "" }) ?? ""
  const decoded = decodeNostrEntity(naddr)
  assertExists(decoded)
  assertEquals(decoded.type, "naddr")
  if (decoded.type === "naddr") assertEquals(decoded.address.dTag, "")
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

Deno.test("stripNostrUriPrefix - trims NUL, tab and vertical tab around the input and after the prefix", () => {
  assertEquals(stripNostrUriPrefix("\0\tnostr:\vnpub1abc\0"), "npub1abc")
})

Deno.test("stripNostrUriPrefix - keeps a no-break space or byte order mark, which PHP's trim set does not hold", () => {
  assertEquals(stripNostrUriPrefix("\u00a0nostr:npub1abc\ufeff"), "\u00a0nostr:npub1abc\ufeff")
})

Deno.test("stripNostrUriPrefix - returns input unchanged when no prefix", () => {
  assertEquals(stripNostrUriPrefix("npub1abc"), "npub1abc")
})

Deno.test("stripNostrUriPrefix - returns empty string for empty input", () => {
  assertEquals(stripNostrUriPrefix(""), "")
})

Deno.test("decodeNostrEntity - an npub names its pubkey", () => {
  assertEquals(decodeNostrEntity(encodePubkeyToNpub(VALID_HEX_PUBKEY))?.pubkey, VALID_HEX_PUBKEY)
})

Deno.test("decodeNostrEntity - an nprofile names its pubkey", () => {
  assertEquals(decodeNostrEntity(encodeNprofile(VALID_HEX_PUBKEY) ?? "")?.pubkey, VALID_HEX_PUBKEY)
})

Deno.test("decodeNostrEntity - a note names no pubkey", () => {
  assertEquals(decodeNostrEntity(encodeEventIdToNote(VALID_HEX_EVENT))?.pubkey, null)
})

Deno.test("decodeNostrEntity - an nevent without an author names no pubkey", () => {
  assertEquals(decodeNostrEntity(encodeNevent(VALID_HEX_EVENT) ?? "")?.pubkey, null)
})

Deno.test("decodeNostrEntity - canonicalises relay hints, reads a repeated one once and drops one that is not a relay URL", () => {
  const hints = ["WSS://Relay.Example.COM/", "not a relay", "wss://relay.example.com"].map((hint) =>
    [1, utf8(hint)] as const
  )
  const decoded = decodeNostrEntity(tlvEntity("nprofile", [[0, PUBKEY_BYTES], ...hints]))
  assertEquals(decoded?.type === "nprofile" ? decoded.relays.map(String) : null, ["wss://relay.example.com"])
})

Deno.test("encodeNprofile - takes relay hints only as canonical RelayUrls", () => {
  // @ts-expect-error: a hint is a RelayUrl, put through parseRelayUrl before it is encoded
  assertEquals(encodeNprofile(VALID_HEX_PUBKEY, ["wss://relay.example.com"])?.startsWith("nprofile1"), true)
})

Deno.test("decodeNostrEntity - reads the nevent kind as a big-endian unsigned 32-bit value", () => {
  const decoded = decodeNostrEntity(tlvEntity("nevent", [[0, EVENT_BYTES], [3, [0, 0, 0x75, 0x30]]]))
  assertEquals(decoded?.type === "nevent" ? decoded.kind : null, 30000)
})

Deno.test("decodeNostrEntity - rejects an nevent whose kind is outside NIP-01's 0-65535", () => {
  assertEquals(decodeNostrEntity(tlvEntity("nevent", [[0, EVENT_BYTES], [3, [0x80, 0, 0, 1]]])), null)
})

Deno.test("decodeNostrEntity - refuses an entity with space around it", () => {
  assertEquals(decodeNostrEntity(` ${encodePubkeyToNpub(VALID_HEX_PUBKEY)} `), null)
})

Deno.test("decodeNostrEntity - names the pubkey of any pubkey-bearing entity without the caller branching on type", () => {
  const nevent = encodeNevent(VALID_HEX_EVENT, { authorPubkey: VALID_HEX_PUBKEY }) ?? ""
  const naddr = encodeNaddr({ kind: 30023, pubkey: VALID_HEX_PUBKEY, dTag: "article" }) ?? ""
  assertEquals([nevent, naddr].map((entity) => decodeNostrEntity(entity)?.pubkey), [VALID_HEX_PUBKEY, VALID_HEX_PUBKEY])
})

Deno.test("decodeNostrEntity - NIP-19 vector: npub10elfcs… is 7e7e9c42…", () => {
  assertEquals(decodeNostrEntity("npub10elfcs4fr0l0r8af98jlmgdh9c8tcxjvz9qkw038js35mp4dma8qzvjptg"), {
    type: "npub",
    pubkey: publicKeyFixture("7e7e9c42a91bfef19fa929e5fda1b72e0ebc1a4c1141673e2794234d86addf4e"),
  })
})

Deno.test("encodePubkeyToNpub - NIP-19 vector: 3bf0c63f… is npub180cvv07…", () => {
  assertEquals(
    encodePubkeyToNpub(VALID_HEX_PUBKEY),
    "npub180cvv07tjdrrgpa0j7j7tmnyl2yr6yr7l8j4s3evf6u64th6gkwsyjh6w6",
  )
})

Deno.test("decodeNostrEntity - NIP-19 vector: nprofile1qqsrhuxx… carries the pubkey and two relays", () => {
  const nprofile =
    "nprofile1qqsrhuxx8l9ex335q7he0f09aej04zpazpl0ne2cgukyawd24mayt8gpp4mhxue69uhhytnc9e3k7mgpz4mhxue69uhkg6nzv9ejuumpv34kytnrdaksjlyr9p"
  const decoded = decodeNostrEntity(nprofile)
  assertEquals(decoded?.type === "nprofile" ? decoded.pubkey : null, VALID_HEX_PUBKEY)
  assertEquals(decoded?.type === "nprofile" ? decoded.relays.map(String) : null, [
    "wss://r.x.com",
    "wss://djbas.sadkb.com",
  ])
})

Deno.test("decodeNostrEntity - ignores a TLV type NIP-19 does not define", () => {
  const decoded = decodeNostrEntity(tlvEntity("nprofile", [[0, PUBKEY_BYTES], [9, [1, 2, 3]]]))
  assertEquals(decoded, { type: "nprofile", pubkey: VALID_HEX_PUBKEY, relays: [] })
})

Deno.test("decodeNostrEntity - a TLV stream cut off inside a value is malformed", () => {
  const truncated = [0, 32, ...PUBKEY_BYTES, 1, 10, ...utf8("wss://")]
  assertEquals(decodeNostrEntity(encodeRaw("nprofile", truncated)), null)
})

Deno.test("decodeNostrEntity - a TLV stream ending after a type byte is malformed", () => {
  assertEquals(decodeNostrEntity(encodeRaw("nprofile", [0, 32, ...PUBKEY_BYTES, 1])), null)
})

Deno.test("decodeNostrEntity - rejects a string longer than NIP-19's 5000 characters", () => {
  const relays = Array.from({ length: 13 }, (_, i) => [1, 250, ...utf8(`wss://${String(i).padEnd(244, "r")}`)])
  const long = encodeRaw("nprofile", [0, 32, ...PUBKEY_BYTES, ...relays.flat()])
  assertEquals(long.length > 5000, true)
  assertEquals(decodeNostrEntity(long), null)
})

Deno.test("decodeNostrEntity - accepts an all-upper-case string and rejects a mixed-case one", () => {
  const npub = encodePubkeyToNpub(VALID_HEX_PUBKEY)
  assertEquals(decodeNostrEntity(npub.toUpperCase()), { type: "npub", pubkey: VALID_HEX_PUBKEY })
  assertEquals(decodeNostrEntity(`npub1${npub.slice(5, 10).toUpperCase()}${npub.slice(10)}`), null)
})

Deno.test("decodeNostrEntity - rejects an nevent whose author record is not 32 bytes", () => {
  assertEquals(decodeNostrEntity(tlvEntity("nevent", [[0, EVENT_BYTES], [2, [1, 2, 3]]])), null)
})

Deno.test("decodeNostrEntity - accepts an naddr for a replaceable kind with an empty identifier", () => {
  const naddr = tlvEntity("naddr", [[0, []], [2, PUBKEY_BYTES], [3, [0, 0, 0x27, 0x12]]])
  assertEquals(decodeNostrEntity(naddr), {
    type: "naddr",
    address: { kind: 10002, pubkey: VALID_HEX_PUBKEY, dTag: "" },
    pubkey: VALID_HEX_PUBKEY,
    relays: [],
  })
})

Deno.test("decodeNostrEntity - rejects an naddr for a replaceable kind with a non-empty identifier", () => {
  const naddr = tlvEntity("naddr", [[0, utf8("x")], [2, PUBKEY_BYTES], [3, [0, 0, 0x27, 0x12]]])
  assertEquals(decodeNostrEntity(naddr), null)
})

Deno.test("decodeNostrEntity - rejects an naddr for a regular kind", () => {
  assertEquals(decodeNostrEntity(tlvEntity("naddr", [[0, []], [2, PUBKEY_BYTES], [3, [0, 0, 0, 1]]])), null)
})

Deno.test("decodeNostrEntity - rejects an naddr missing its identifier, author or kind record", () => {
  const identifier: readonly [number, ReadonlyArray<number>] = [0, utf8("slug")]
  const author: readonly [number, ReadonlyArray<number>] = [2, PUBKEY_BYTES]
  const kind: readonly [number, ReadonlyArray<number>] = [3, KIND_LONGFORM_BYTES]
  assertEquals(decodeNostrEntity(tlvEntity("naddr", [identifier, author, kind])) !== null, true)
  assertEquals(decodeNostrEntity(tlvEntity("naddr", [author, kind])), null)
  assertEquals(decodeNostrEntity(tlvEntity("naddr", [identifier, kind])), null)
  assertEquals(decodeNostrEntity(tlvEntity("naddr", [identifier, author])), null)
})

Deno.test("encodeNevent - refuses a kind outside NIP-01's 0-65535", () => {
  assertEquals(encodeNevent(VALID_HEX_EVENT, { kind: 65536 }), null)
})

Deno.test("encodeNevent - refuses, at compile time, null as a second spelling of an absent author (ADR-0033)", () => {
  // @ts-expect-error: an absent author is left out, never null
  const options: EncodeNeventOptions = { authorPubkey: null }
  assertEquals(options.authorPubkey, null)
})

Deno.test("encodeNevent - writes kind 0, which is a kind and not an absent one", () => {
  const decoded = decodeNostrEntity(encodeNevent(VALID_HEX_EVENT, { kind: 0 }) ?? "")
  assertEquals(decoded?.type === "nevent" ? decoded.kind : null, 0)
})

Deno.test("encodeNaddr - refuses an identifier longer than a one-byte TLV length", () => {
  assertEquals(encodeNaddr({ kind: 30023, pubkey: VALID_HEX_PUBKEY, dTag: "d".repeat(256) }), null)
})

Deno.test("encodeNaddr - refuses what the decoder rejects: a regular kind, or a replaceable kind with a d", () => {
  assertEquals(encodeNaddr({ kind: 1, pubkey: VALID_HEX_PUBKEY, dTag: "" }), null)
  assertEquals(encodeNaddr({ kind: 10002, pubkey: VALID_HEX_PUBKEY, dTag: "x" }), null)
})

Deno.test("encodeNaddr - encodes a replaceable kind with the empty identifier", () => {
  const naddr = encodeNaddr({ kind: 10002, pubkey: VALID_HEX_PUBKEY, dTag: "" }) ?? ""
  assertEquals(decodeNostrEntity(naddr ?? ""), {
    type: "naddr",
    address: { kind: 10002, pubkey: VALID_HEX_PUBKEY, dTag: "" },
    pubkey: VALID_HEX_PUBKEY,
    relays: [],
  })
})

Deno.test("encodeNprofile - refuses an entity longer than NIP-19's 5000 characters", () => {
  const relays = Array.from({ length: 20 }, (_, i) => relayUrlFixture(`wss://r${i}.example/${"p".repeat(170)}`))
  assertEquals(encodeNprofile(VALID_HEX_PUBKEY, relays), null)
})

const OTHER_PUBKEY_BYTES: ReadonlyArray<number> = Array(32).fill(0x11)
const KIND_ONE_BYTES: ReadonlyArray<number> = [0, 0, 0, 1]

Deno.test("decodeNostrEntity - an nevent author repeated with one value is that one author (shared ADR-0094)", () => {
  const decoded = decodeNostrEntity(tlvEntity("nevent", [[0, EVENT_BYTES], [2, PUBKEY_BYTES], [2, PUBKEY_BYTES]]))
  assertEquals(decoded?.pubkey, VALID_HEX_PUBKEY)
})

Deno.test("decodeNostrEntity - an nevent whose author records disagree names no author (shared ADR-0094)", () => {
  const decoded = decodeNostrEntity(tlvEntity("nevent", [[0, EVENT_BYTES], [2, PUBKEY_BYTES], [2, OTHER_PUBKEY_BYTES]]))
  assertEquals(decoded?.pubkey, null)
})

Deno.test("decodeNostrEntity - an nevent whose kind records disagree names no kind (shared ADR-0094)", () => {
  const decoded = decodeNostrEntity(
    tlvEntity("nevent", [[0, EVENT_BYTES], [3, KIND_ONE_BYTES], [3, KIND_LONGFORM_BYTES]]),
  )
  assertEquals(decoded?.type === "nevent" ? decoded.kind : "not an nevent", null)
})

Deno.test("decodeNostrEntity - an nevent with a malformed author beside a valid one is refused (shared ADR-0094)", () => {
  assertEquals(decodeNostrEntity(tlvEntity("nevent", [[0, EVENT_BYTES], [2, PUBKEY_BYTES], [2, [1, 2, 3]]])), null)
})

Deno.test("decodeNostrEntity - an nevent whose event id records disagree is refused (shared ADR-0094)", () => {
  assertEquals(decodeNostrEntity(tlvEntity("nevent", [[0, EVENT_BYTES], [0, PUBKEY_BYTES]])), null)
})

Deno.test("decodeNostrEntity - an nprofile whose pubkey records disagree is refused (shared ADR-0094)", () => {
  assertEquals(decodeNostrEntity(tlvEntity("nprofile", [[0, PUBKEY_BYTES], [0, OTHER_PUBKEY_BYTES]])), null)
})

Deno.test("decodeNostrEntity - an naddr whose author records disagree is refused (shared ADR-0094)", () => {
  const naddr = tlvEntity("naddr", [[0, utf8("x")], [2, PUBKEY_BYTES], [2, OTHER_PUBKEY_BYTES], [
    3,
    KIND_LONGFORM_BYTES,
  ]])
  assertEquals(decodeNostrEntity(naddr), null)
})

Deno.test("decodeNostrEntity - an naddr whose kind records disagree is refused (shared ADR-0094)", () => {
  const naddr = tlvEntity("naddr", [[0, utf8("x")], [2, PUBKEY_BYTES], [3, KIND_LONGFORM_BYTES], [3, [
    0,
    0,
    0x75,
    0x48,
  ]]])
  assertEquals(decodeNostrEntity(naddr), null)
})

Deno.test("decodeNostrEntity - an naddr whose identifier records disagree is refused (shared ADR-0094)", () => {
  const naddr = tlvEntity("naddr", [[0, utf8("x")], [0, utf8("y")], [2, PUBKEY_BYTES], [3, KIND_LONGFORM_BYTES]])
  assertEquals(decodeNostrEntity(naddr), null)
})

Deno.test("decodeNostrEntity - an naddr repeating each record with one value decodes (shared ADR-0094)", () => {
  const naddr = tlvEntity("naddr", [
    [0, utf8("x")],
    [0, utf8("x")],
    [2, PUBKEY_BYTES],
    [2, PUBKEY_BYTES],
    [3, KIND_LONGFORM_BYTES],
    [3, KIND_LONGFORM_BYTES],
  ])
  assertEquals(decodeNostrEntity(naddr)?.type, "naddr")
})

Deno.test("decodeNostrEntity - rejects an naddr whose kind is outside NIP-01's 0-65535", () => {
  assertEquals(decodeNostrEntity(tlvEntity("naddr", [[0, utf8("x")], [2, PUBKEY_BYTES], [3, [0, 1, 0, 0]]])), null)
})

Deno.test("decodeNostrEntity - an naddr identifier opening with a byte order mark round-trips with the mark (shared ADR-0094)", () => {
  const naddr = encodeNaddr({ kind: 30023, pubkey: VALID_HEX_PUBKEY, dTag: "﻿hello" }) ?? ""
  const decoded = decodeNostrEntity(naddr)
  assertEquals(decoded?.type === "naddr" ? decoded.address.dTag : null, "﻿hello")
})

Deno.test("decodeNostrEntity - refuses an naddr whose identifier is not valid UTF-8 (shared ADR-0094)", () => {
  const naddr = tlvEntity("naddr", [[0, [0xff, 0xfe]], [2, PUBKEY_BYTES], [3, KIND_LONGFORM_BYTES]])
  assertEquals(decodeNostrEntity(naddr), null)
})

Deno.test("decodeNostrEntity - drops a relay hint that is not valid UTF-8, as one with no canonical form (shared ADR-0084)", () => {
  const hints = [[1, [...utf8("wss://relay.example.com/"), 0xff]], [1, utf8("wss://other.example.com")]] as const
  const decoded = decodeNostrEntity(tlvEntity("nprofile", [[0, PUBKEY_BYTES], ...hints]))
  assertEquals(decoded?.type === "nprofile" ? decoded.relays.map(String) : null, ["wss://other.example.com"])
})

const REPEATED_HINTS = [
  relayUrlFixture("wss://relay.damus.io"),
  relayUrlFixture("wss://nos.lol"),
  relayUrlFixture("wss://relay.damus.io"),
]
const DISTINCT_HINTS = [relayUrlFixture("wss://relay.damus.io"), relayUrlFixture("wss://nos.lol")]

Deno.test("encodeNprofile - writes a repeated relay hint once, at its first position (shared ADR-0084)", () => {
  assertEquals(encodeNprofile(VALID_HEX_PUBKEY, REPEATED_HINTS), encodeNprofile(VALID_HEX_PUBKEY, DISTINCT_HINTS))
})

Deno.test("encodeNevent - writes a repeated relay hint once, at its first position (shared ADR-0084)", () => {
  assertEquals(
    encodeNevent(VALID_HEX_EVENT, { relayUrls: REPEATED_HINTS }),
    encodeNevent(VALID_HEX_EVENT, { relayUrls: DISTINCT_HINTS }),
  )
})

Deno.test("encodeNaddr - writes a repeated relay hint once, at its first position (shared ADR-0084)", () => {
  const address = { kind: 30023, pubkey: VALID_HEX_PUBKEY, dTag: "slug" }
  assertEquals(encodeNaddr(address, REPEATED_HINTS), encodeNaddr(address, DISTINCT_HINTS))
})
