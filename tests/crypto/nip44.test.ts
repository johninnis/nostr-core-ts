import { assert, assertEquals, assertThrows } from "@std/assert"
import { schnorr } from "@noble/curves/secp256k1"
import { sha256 } from "@noble/hashes/sha2"
import { bytesToHex, hexToBytes } from "@noble/hashes/utils"
import {
  getNip44ConversationKey,
  NIP44_MAX_PLAINTEXT_SIZE,
  NIP44_MIN_PLAINTEXT_SIZE,
  nip44Decrypt,
  nip44Encrypt,
} from "../../src/infrastructure/adapter/nip44-adapter.ts"
import { v2 as nip44v2 } from "../../src/infrastructure/crypto/nip44-v2.ts"
import { parsePublicKey, type PublicKey } from "../../src/domain/value-object/public-key.ts"

interface ConversationKeyVector {
  readonly sec1: string
  readonly pub2: string
  readonly conversation_key: string
}
interface InvalidConversationKeyVector extends ConversationKeyVector {
  readonly note: string
}
interface EncryptDecryptVector {
  readonly sec1: string
  readonly sec2: string
  readonly conversation_key: string
  readonly nonce: string
  readonly plaintext: string
  readonly payload: string
}
interface EncryptDecryptLongVector {
  readonly conversation_key: string
  readonly nonce: string
  readonly pattern: string
  readonly repeat: number
  readonly plaintext_sha256: string
  readonly payload_sha256: string
}
interface InvalidDecryptVector {
  readonly conversation_key: string
  readonly payload: string
  readonly note: string
}
interface Nip44Vectors {
  readonly v2: {
    readonly valid: {
      readonly calc_padded_len: ReadonlyArray<readonly [number, number]>
      readonly get_conversation_key: ReadonlyArray<ConversationKeyVector>
      readonly encrypt_decrypt: ReadonlyArray<EncryptDecryptVector>
      readonly encrypt_decrypt_long_msg: ReadonlyArray<EncryptDecryptLongVector>
    }
    readonly invalid: {
      readonly encrypt_msg_lengths: ReadonlyArray<number>
      readonly get_conversation_key: ReadonlyArray<InvalidConversationKeyVector>
      readonly decrypt: ReadonlyArray<InvalidDecryptVector>
    }
  }
}

const FIXTURE: Nip44Vectors = JSON.parse(await Deno.readTextFile(new URL("./nip44-vectors.json", import.meta.url)))
const VECTORS = FIXTURE.v2

const requireBytes = (hex: string): Uint8Array => {
  const bytes = hexToBytes(hex)
  if (!bytes) throw new Error(`invalid hex: ${hex}`)
  return bytes
}

const pubkeyFromSecret = (secHex: string): PublicKey =>
  parsePublicKey(bytesToHex(schnorr.getPublicKey(requireBytes(secHex))))

const repeatPattern = (pattern: string, count: number): string => pattern.repeat(count)

Deno.test("nip44 calc_padded_len - spec vectors", () => {
  for (const [unpadded, expected] of VECTORS.valid.calc_padded_len) {
    assertEquals(nip44v2.utils.calcPaddedLen(unpadded), expected, `len=${unpadded}`)
  }
})

Deno.test("nip44 get_conversation_key - spec vectors", () => {
  for (const v of VECTORS.valid.get_conversation_key) {
    assertEquals(
      bytesToHex(getNip44ConversationKey(requireBytes(v.sec1), parsePublicKey(v.pub2))),
      v.conversation_key,
      `sec1=${v.sec1}`,
    )
  }
})

Deno.test("nip44 encrypt_decrypt - spec vectors (deterministic nonce)", () => {
  for (const v of VECTORS.valid.encrypt_decrypt) {
    const sender = requireBytes(v.sec1)
    const recipientPubkey = pubkeyFromSecret(v.sec2)
    const ck = getNip44ConversationKey(sender, recipientPubkey)
    assertEquals(bytesToHex(ck), v.conversation_key, `ck for sec1=${v.sec1}`)

    const payload = nip44Encrypt(ck, v.plaintext, requireBytes(v.nonce))
    assertEquals(payload, v.payload, `encrypt sec1=${v.sec1}`)

    const recipient = requireBytes(v.sec2)
    const senderPubkey = pubkeyFromSecret(v.sec1)
    const ckBack = getNip44ConversationKey(recipient, senderPubkey)
    assertEquals(nip44Decrypt(ckBack, payload), v.plaintext, `decrypt sec1=${v.sec1}`)
  }
})

Deno.test("nip44 encrypt_decrypt_long_msg - spec vectors (sha256 of plaintext/payload)", () => {
  for (const v of VECTORS.valid.encrypt_decrypt_long_msg) {
    const ck = requireBytes(v.conversation_key)
    const plaintext = repeatPattern(v.pattern, v.repeat)
    assertEquals(bytesToHex(sha256(new TextEncoder().encode(plaintext))), v.plaintext_sha256, "plaintext sha256")

    const payload = nip44Encrypt(ck, plaintext, requireBytes(v.nonce))
    assertEquals(bytesToHex(sha256(new TextEncoder().encode(payload))), v.payload_sha256, "payload sha256")

    assertEquals(nip44Decrypt(ck, payload), plaintext, "round-trip")
  }
})

Deno.test("nip44 invalid.get_conversation_key - spec vectors throw on bad peer pubkey", () => {
  for (const v of VECTORS.invalid.get_conversation_key) {
    assertThrows(
      () => getNip44ConversationKey(requireBytes(v.sec1), parsePublicKey(v.pub2)),
      Error,
      undefined,
      v.note,
    )
  }
})

Deno.test("nip44 invalid.encrypt_msg_lengths - rejects out-of-range plaintext lengths", () => {
  const ck = new Uint8Array(32).fill(1)
  for (const len of VECTORS.invalid.encrypt_msg_lengths) {
    const plaintext = len === 0 ? "" : "a".repeat(len)
    assertThrows(() => nip44Encrypt(ck, plaintext), Error, undefined, `len=${len}`)
  }
})

Deno.test("nip44 invalid.decrypt - spec vectors all throw", () => {
  for (const v of VECTORS.invalid.decrypt) {
    assertThrows(() => nip44Decrypt(requireBytes(v.conversation_key), v.payload), Error, undefined, v.note)
  }
})

Deno.test("nip44 round-trip - random nonce", () => {
  const sk1 = schnorr.utils.randomSecretKey()
  const sk2 = schnorr.utils.randomSecretKey()
  const pk1 = parsePublicKey(bytesToHex(schnorr.getPublicKey(sk1)))
  const pk2 = parsePublicKey(bytesToHex(schnorr.getPublicKey(sk2)))
  const ck1 = getNip44ConversationKey(sk1, pk2)
  const ck2 = getNip44ConversationKey(sk2, pk1)
  assertEquals(bytesToHex(ck1), bytesToHex(ck2), "symmetric conversation key")
  const plaintext = "hello, nostr"
  const payload = nip44Encrypt(ck1, plaintext)
  assertEquals(nip44Decrypt(ck2, payload), plaintext)
})

Deno.test("nip44 encrypt - rejects nonce of wrong length", () => {
  const ck = new Uint8Array(32).fill(1)
  assert(typeof nip44Encrypt === "function")
  assertThrows(() => nip44Encrypt(ck, "hello", new Uint8Array(16)), Error)
})

Deno.test("NIP44 size constants match the codec's exported bounds", () => {
  assertEquals(NIP44_MIN_PLAINTEXT_SIZE, nip44v2.utils.minPlaintextSize)
  assertEquals(NIP44_MAX_PLAINTEXT_SIZE, nip44v2.utils.maxPlaintextSize)
})
