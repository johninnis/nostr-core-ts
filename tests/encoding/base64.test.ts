import { assertEquals } from "@std/assert"
import { base64urlnopad } from "@scure/base"
import { decodeBase64, decodeBase64UrlUnpadded } from "../../src/domain/service/base64.ts"
import { sha256Hex } from "../../src/domain/service/sha256.ts"

Deno.test("decodeBase64 - decodes canonical padded base64", () => {
  assertEquals(decodeBase64("QUI="), new Uint8Array([65, 66]))
})

Deno.test("decodeBase64 - decodes the empty string to no bytes", () => {
  assertEquals(decodeBase64(""), new Uint8Array(0))
})

Deno.test("decodeBase64 - null for base64 missing its padding", () => {
  assertEquals(decodeBase64("QUI"), null)
})

Deno.test("decodeBase64 - null for base64 whose bits after the last byte are not zero", () => {
  assertEquals(decodeBase64("QUJ="), null)
})

Deno.test("decodeBase64 - null for a character outside the standard alphabet", () => {
  assertEquals(decodeBase64("QU-D"), null)
})

Deno.test("decodeBase64 - null for embedded whitespace", () => {
  assertEquals(decodeBase64("QUJ D"), null)
})

Deno.test("decodeBase64 - agrees with the decoder on every one- and two-byte input", () => {
  const all = Array.from({ length: 256 * 257 }, (_, i) => i < 256 ? [i] : [(i - 256) >> 8, (i - 256) & 0xff])
  const mismatched = all.filter((bytes) => {
    const encoded = btoa(String.fromCharCode(...bytes))
    return decodeBase64(encoded)?.join() !== bytes.join()
  })
  assertEquals(mismatched, [])
})

Deno.test("decodeBase64UrlUnpadded - decodes canonical unpadded base64url", () => {
  assertEquals(
    [decodeBase64UrlUnpadded("QUJD"), decodeBase64UrlUnpadded("QUI"), decodeBase64UrlUnpadded("QQ")],
    [new Uint8Array([65, 66, 67]), new Uint8Array([65, 66]), new Uint8Array([65])],
  )
})

Deno.test("decodeBase64UrlUnpadded - decodes the URL-safe alphabet", () => {
  assertEquals(decodeBase64UrlUnpadded("-_8"), new Uint8Array([0xfb, 0xff]))
})

Deno.test("decodeBase64UrlUnpadded - decodes the empty string to no bytes", () => {
  assertEquals(decodeBase64UrlUnpadded(""), new Uint8Array(0))
})

Deno.test("decodeBase64UrlUnpadded - null for every spelling that is not the canonical unpadded base64url", () => {
  assertEquals(["QUI=", "QUJ", "QU I", "QU!", "+/8", "QUJDR"].map(decodeBase64UrlUnpadded), [
    null,
    null,
    null,
    null,
    null,
    null,
  ])
})

Deno.test("decodeBase64UrlUnpadded - agrees with the decoder on every one- and two-byte input", () => {
  const all = Array.from({ length: 256 * 257 }, (_, i) => i < 256 ? [i] : [(i - 256) >> 8, (i - 256) & 0xff])
  const mismatched = all.filter((bytes) => {
    const encoded = base64urlnopad.encode(new Uint8Array(bytes))
    return decodeBase64UrlUnpadded(encoded)?.join() !== bytes.join()
  })
  assertEquals(mismatched, [])
})

const BUD11_EXAMPLE_JSON_SHA256 = "cda3d8ee478babdc79e23969f8694a5af3c564227f74938ebe7f8f0821d3865e"

Deno.test("decodeBase64UrlUnpadded - decodes the BUD-11 example header's credentials", async () => {
  const vectors: { readonly vectors: ReadonlyArray<readonly [string, string]> } = JSON.parse(
    await Deno.readTextFile(new URL("../auth/blossom-auth-header-vectors.json", import.meta.url)),
  )
  const credentials = (vectors.vectors[0]?.[0] ?? "").slice("Nostr ".length)
  assertEquals(sha256Hex(decodeBase64UrlUnpadded(credentials) ?? new Uint8Array()), BUD11_EXAMPLE_JSON_SHA256)
})
