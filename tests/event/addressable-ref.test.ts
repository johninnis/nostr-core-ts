import { assertEquals } from "@std/assert"
import {
  formatAddressableRef,
  isValidAddressableRef,
  parseAddressableRef,
} from "../../src/domain/value-object/addressable-ref.ts"
import { publicKeyFixture } from "../../testing.ts"

const PUBKEY = publicKeyFixture("a".repeat(64))

Deno.test("formatAddressableRef joins kind, pubkey, dTag with colons", () => {
  assertEquals(formatAddressableRef({ kind: 30023, pubkey: PUBKEY, dTag: "my-article" }), `30023:${PUBKEY}:my-article`)
})

Deno.test("formatAddressableRef preserves an empty dTag with a trailing colon", () => {
  assertEquals(formatAddressableRef({ kind: 30030, pubkey: PUBKEY, dTag: "" }), `30030:${PUBKEY}:`)
})

Deno.test("formatAddressableRef preserves dTag content containing colons", () => {
  assertEquals(
    formatAddressableRef({ kind: 30023, pubkey: PUBKEY, dTag: "ns:id:42" }),
    `30023:${PUBKEY}:ns:id:42`,
  )
})

Deno.test("formatAddressableRef round-trips through parseAddressableRef", () => {
  const ref = { kind: 30023, pubkey: PUBKEY, dTag: "round-trip" }
  const parsed = parseAddressableRef(formatAddressableRef(ref))
  assertEquals(parsed, { kind: ref.kind, pubkey: String(ref.pubkey), dTag: ref.dTag })
})

Deno.test("parseAddressableRef returns null for missing parts", () => {
  assertEquals(parseAddressableRef("30023"), null)
  assertEquals(parseAddressableRef(`30023:${PUBKEY}`), null)
})

Deno.test("parseAddressableRef returns null for non-integer kind", () => {
  assertEquals(parseAddressableRef(`30023abc:${PUBKEY}:d`), null)
  assertEquals(parseAddressableRef(`abc:${PUBKEY}:d`), null)
})

Deno.test("parseAddressableRef returns null for invalid pubkey", () => {
  assertEquals(parseAddressableRef(`30023:not-a-pubkey:d`), null)
  assertEquals(parseAddressableRef(`30023:${"a".repeat(63)}:d`), null)
})

Deno.test("parseAddressableRef preserves dTag content containing colons", () => {
  assertEquals(
    parseAddressableRef(`30023:${PUBKEY}:ns:id:42`),
    { kind: 30023, pubkey: PUBKEY, dTag: "ns:id:42" },
  )
})

Deno.test("parseAddressableRef accepts an empty dTag", () => {
  assertEquals(parseAddressableRef(`30030:${PUBKEY}:`), { kind: 30030, pubkey: PUBKEY, dTag: "" })
})

Deno.test("parseAddressableRef accepts a replaceable kind with the empty d (NIP-01 trailing colon)", () => {
  assertEquals(parseAddressableRef(`10002:${PUBKEY}:`), { kind: 10002, pubkey: PUBKEY, dTag: "" })
})

Deno.test("parseAddressableRef rejects a replaceable kind with a non-empty d", () => {
  assertEquals(parseAddressableRef(`10002:${PUBKEY}:x`), null)
})

Deno.test("parseAddressableRef rejects a regular or ephemeral kind", () => {
  assertEquals(parseAddressableRef(`1:${PUBKEY}:`), null)
  assertEquals(parseAddressableRef(`20000:${PUBKEY}:`), null)
})

Deno.test("parseAddressableRef accepts a d identifier holding a newline, since a d tag value may be any string (NIP-01)", () => {
  assertEquals(parseAddressableRef(`30023:${PUBKEY}:line one\nline two`), {
    kind: 30023,
    pubkey: PUBKEY,
    dTag: "line one\nline two",
  })
})

Deno.test("parseAddressableRef rejects a kind written with a leading zero, which is not its canonical decimal form", () => {
  assertEquals(parseAddressableRef(`030023:${PUBKEY}:x`), null)
  assertEquals(parseAddressableRef(`00:${PUBKEY}:`), null)
})

Deno.test("parseAddressableRef accepts kind 0 written as the single digit 0", () => {
  assertEquals(parseAddressableRef(`0:${PUBKEY}:`), { kind: 0, pubkey: PUBKEY, dTag: "" })
})

Deno.test("parseAddressableRef rejects a kind written with non-ASCII digits or a sign", () => {
  assertEquals(parseAddressableRef(`٣٠٠٢٣:${PUBKEY}:x`), null)
  assertEquals(parseAddressableRef(`+30023:${PUBKEY}:x`), null)
})

Deno.test("isValidAddressableRef - an addressable kind takes any d, a replaceable kind only the empty d", () => {
  assertEquals(
    [
      { kind: 30023, pubkey: PUBKEY, dTag: "a" },
      { kind: 30023, pubkey: PUBKEY, dTag: "" },
      { kind: 0, pubkey: PUBKEY, dTag: "" },
      { kind: 0, pubkey: PUBKEY, dTag: "a" },
      { kind: 1, pubkey: PUBKEY, dTag: "" },
    ].map(isValidAddressableRef),
    [true, true, true, false, false],
  )
})
