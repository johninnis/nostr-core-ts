import { assertEquals } from "@std/assert"
import { formatAddressableRef, parseAddressableRef } from "../../src/domain/value-object/addressable-ref.ts"
import { parsePublicKey } from "../../src/domain/value-object/public-key.ts"

const PUBKEY = parsePublicKey("a".repeat(64))

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
