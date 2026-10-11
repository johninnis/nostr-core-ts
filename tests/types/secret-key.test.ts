import { assertEquals } from "@std/assert"
import { secp256k1 } from "@noble/curves/secp256k1"
import { hexToBytes } from "@noble/hashes/utils"
import { InvalidArgumentError } from "../../src/domain/exception/invalid-argument-error.ts"
import { parseSecretKey } from "../../src/domain/service/secret-key.ts"
import { createLocalSigner } from "../../src/infrastructure/crypto/local-signer.ts"

const CURVE_ORDER_HEX = secp256k1.Point.CURVE().n.toString(16)
const LARGEST_SCALAR_HEX = (secp256k1.Point.CURVE().n - 1n).toString(16)
const ONE_HEX = "00".repeat(31) + "01"

const signerAccepts = (hex: string): boolean => {
  try {
    createLocalSigner(hexToBytes(hex))
    return true
  } catch (error) {
    if (error instanceof InvalidArgumentError) return false
    throw error
  }
}

const bytesOfOne = (): Uint8Array => {
  const bytes = new Uint8Array(32)
  bytes[31] = 1
  return bytes
}

Deno.test("parseSecretKey - reads 64 lowercase hex characters of a scalar in range as its 32 bytes", () => {
  assertEquals(parseSecretKey(ONE_HEX), bytesOfOne())
})

Deno.test("parseSecretKey - reads the largest scalar, n − 1", () => {
  assertEquals(parseSecretKey(LARGEST_SCALAR_HEX)?.length, 32)
})

Deno.test("parseSecretKey - returns null for the zero key, which has no public key", () => {
  assertEquals(parseSecretKey("0".repeat(64)), null)
})

Deno.test("parseSecretKey - returns null for the curve order n, never reducing it to zero", () => {
  assertEquals(parseSecretKey(CURVE_ORDER_HEX), null)
})

Deno.test("parseSecretKey - returns null for a value above n, never reducing it into range", () => {
  assertEquals(parseSecretKey("f".repeat(64)), null)
})

Deno.test("parseSecretKey - returns null for upper-case hex, whose canonical form is lower-case", () => {
  assertEquals(parseSecretKey(LARGEST_SCALAR_HEX.toUpperCase()), null)
})

Deno.test("parseSecretKey - returns null for 31 bytes of hex", () => {
  assertEquals(parseSecretKey("01".repeat(31)), null)
})

Deno.test("parseSecretKey - returns null for 33 bytes of hex", () => {
  assertEquals(parseSecretKey("01".repeat(33)), null)
})

Deno.test("parseSecretKey - returns null for odd-length hex", () => {
  assertEquals(parseSecretKey(ONE_HEX + "1"), null)
})

Deno.test("parseSecretKey - returns null for non-hex characters", () => {
  assertEquals(parseSecretKey("g".repeat(64)), null)
})

Deno.test("parseSecretKey - returns null for the empty string", () => {
  assertEquals(parseSecretKey(""), null)
})

Deno.test("parseSecretKey - accepts exactly the keys createLocalSigner accepts as an argument", () => {
  const samples = [ONE_HEX, LARGEST_SCALAR_HEX, "0".repeat(64), CURVE_ORDER_HEX, "f".repeat(64)]

  assertEquals(samples.map((hex) => parseSecretKey(hex) !== null), samples.map(signerAccepts))
})
