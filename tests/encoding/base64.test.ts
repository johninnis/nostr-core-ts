import { assertEquals } from "@std/assert"
import { decodeBase64 } from "../../src/domain/service/base64.ts"

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
