import { assertEquals } from "@std/assert"
import { secp256k1 } from "@noble/curves/secp256k1"
import { bytesToHex } from "@noble/hashes/utils"
import { sharedX } from "../../src/infrastructure/crypto/shared-x.ts"
import type { PublicKey } from "../../src/domain/value-object/public-key.ts"
import { publicKeyFixture } from "../../testing.ts"
import { sourceFilesMatching } from "../support/source-files.ts"

const secretA = new Uint8Array(32).fill(1)
const secretB = new Uint8Array(32).fill(2)
const pubkeyOf = (secret: Uint8Array): PublicKey =>
  publicKeyFixture(bytesToHex(secp256k1.getPublicKey(secret, true).subarray(1)))

Deno.test("sharedX - both peers derive the same x coordinate", () => {
  assertEquals(bytesToHex(sharedX(secretA, pubkeyOf(secretB))), bytesToHex(sharedX(secretB, pubkeyOf(secretA))))
})

Deno.test("sharedX - only the NIP-04 codec uses it; the vendored NIP-44 codec keeps its own ECDH step (ADR-0016)", async () => {
  assertEquals(await sourceFilesMatching(/shared-x\.ts/), ["infrastructure/crypto/nip04-codec.ts"])
  assertEquals(await sourceFilesMatching(/getSharedSecret\(/), [
    "infrastructure/crypto/nip44-v2.ts",
    "infrastructure/crypto/shared-x.ts",
  ])
})
