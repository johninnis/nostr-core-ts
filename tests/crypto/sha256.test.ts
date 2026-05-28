import { assertEquals } from "@std/assert"
import { computeSha256, sha256Hex } from "../../src/domain/service/sha256.ts"
import { hexRegex } from "../../src/domain/value-object/hex.ts"

Deno.test("sha256Hex - hashes the empty string", async () => {
  assertEquals(await sha256Hex(""), "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855")
})

Deno.test("sha256Hex - hashes 'abc'", async () => {
  assertEquals(await sha256Hex("abc"), "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad")
})

Deno.test("sha256Hex - hashes a longer string", async () => {
  assertEquals(
    await sha256Hex("abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq"),
    "248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1",
  )
})

Deno.test("computeSha256 - hashes a byte buffer to the same digest as sha256Hex", async () => {
  const buffer = new TextEncoder().encode("abc").buffer
  assertEquals(await computeSha256(buffer), await sha256Hex("abc"))
})

Deno.test("computeSha256 - returns a 64-character hex digest", async () => {
  const digest = await computeSha256(new Uint8Array([1, 2, 3]).buffer)
  assertEquals(digest.length, 64)
  assertEquals(hexRegex(64).test(digest), true)
})
