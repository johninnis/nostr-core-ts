import { assertEquals } from "@std/assert"
import { sourceFilesMatching } from "../support/source-files.ts"
import { sha256Hex } from "../../src/domain/service/sha256.ts"
import { isLowercaseHex } from "../../src/domain/value-object/brand.ts"

Deno.test("sha256Hex - hashes the empty string", () => {
  assertEquals(sha256Hex(""), "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855")
})

Deno.test("sha256Hex - hashes 'abc'", () => {
  assertEquals(sha256Hex("abc"), "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad")
})

Deno.test("sha256Hex - hashes a longer string", () => {
  assertEquals(
    sha256Hex("abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq"),
    "248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1",
  )
})

Deno.test("sha256Hex - hashes an ArrayBuffer to the digest of the text it encodes", () => {
  const buffer = new TextEncoder().encode("abc").buffer
  assertEquals(sha256Hex(buffer), sha256Hex("abc"))
})

Deno.test("sha256Hex - hashes only the bytes a typed-array view covers", () => {
  const view = new TextEncoder().encode("xabcx").subarray(1, 4)
  assertEquals(sha256Hex(view), sha256Hex("abc"))
})

Deno.test("sha256Hex - returns a 64-character lowercase hex digest of bytes", () => {
  const digest = sha256Hex(new Uint8Array([1, 2, 3]))
  assertEquals(digest.length, 64)
  assertEquals(isLowercaseHex(digest, 64), true)
})

Deno.test("sha256Hex - is the one SHA-256 the source hashes with, beside the vendored NIP-44 file (ADR-0013)", async () => {
  assertEquals(await sourceFilesMatching(/@noble\/hashes\/sha2/), [
    "domain/service/sha256.ts",
    "infrastructure/crypto/nip44-v2.ts",
  ])
})
