import { assert, assertEquals, assertThrows } from "@std/assert"
import { schnorr } from "@noble/curves/secp256k1"
import { sha256 } from "@noble/hashes/sha2"
import { bytesToHex, concatBytes, hexToBytes } from "@noble/hashes/utils"
import {
  getNip44ConversationKey,
  NIP44_MAX_PLAINTEXT_SIZE,
  NIP44_MIN_PLAINTEXT_SIZE,
  nip44Decrypt,
  nip44Encrypt,
} from "../../src/infrastructure/crypto/nip44-codec.ts"
import { v2 as nip44v2 } from "../../src/infrastructure/crypto/nip44-v2.ts"
import { InvalidArgumentError } from "../../src/domain/exception/invalid-argument-error.ts"
import { Nip44CryptoError } from "../../src/domain/exception/nip44-crypto-error.ts"
import type { PublicKey } from "../../src/domain/value-object/public-key.ts"
import { publicKeyFixture } from "../../testing.ts"
import { keyPairOf } from "../support/keys.ts"
import { withTrailingBitSet } from "../support/base64.ts"
import { INVALID_UTF8, nip44PayloadOf, nip44PayloadOfPadded } from "../support/plaintext-bytes.ts"

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
  publicKeyFixture(bytesToHex(schnorr.getPublicKey(requireBytes(secHex))))

const repeatPattern = (pattern: string, count: number): string => pattern.repeat(count)

Deno.test("nip44 calc_padded_len - spec vectors", () => {
  for (const [unpadded, expected] of VECTORS.valid.calc_padded_len) {
    assertEquals(nip44v2.utils.calcPaddedLen(unpadded), expected, `len=${unpadded}`)
  }
})

Deno.test("nip44 get_conversation_key - spec vectors", () => {
  for (const v of VECTORS.valid.get_conversation_key) {
    assertEquals(
      bytesToHex(getNip44ConversationKey(requireBytes(v.sec1), publicKeyFixture(v.pub2))),
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

    const payload = nip44v2.encrypt(v.plaintext, ck, requireBytes(v.nonce))
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

    const payload = nip44v2.encrypt(plaintext, ck, requireBytes(v.nonce))
    assertEquals(bytesToHex(sha256(new TextEncoder().encode(payload))), v.payload_sha256, "payload sha256")

    assertEquals(nip44Decrypt(ck, payload), plaintext, "round-trip")
  }
})

const invalidConversationKeyVectors = (party: "sec1" | "pub2"): ReadonlyArray<InvalidConversationKeyVector> =>
  VECTORS.invalid.get_conversation_key.filter((v) => v.note.startsWith(party))

Deno.test("nip44 invalid.get_conversation_key - spec vectors with a bad peer pubkey throw Nip44CryptoError", () => {
  for (const v of invalidConversationKeyVectors("pub2")) {
    assertThrows(
      () => getNip44ConversationKey(requireBytes(v.sec1), publicKeyFixture(v.pub2)),
      Nip44CryptoError,
      undefined,
      v.note,
    )
  }
})

Deno.test("nip44 invalid.get_conversation_key - spec vectors with a bad secret key are misuse and throw InvalidArgumentError", () => {
  for (const v of invalidConversationKeyVectors("sec1")) {
    assertThrows(
      () => getNip44ConversationKey(requireBytes(v.sec1), publicKeyFixture(v.pub2)),
      InvalidArgumentError,
      undefined,
      v.note,
    )
  }
})

const EXTENDED_PREFIX_THRESHOLD = 65536

Deno.test("nip44 invalid.encrypt_msg_lengths - rejects the vector lengths still outside the extended format's range", () => {
  const ck = new Uint8Array(32).fill(1)
  const outOfRange = VECTORS.invalid.encrypt_msg_lengths.filter((len) => len < EXTENDED_PREFIX_THRESHOLD)
  assertEquals(outOfRange, [0])
  for (const len of outOfRange) {
    assertThrows(() => nip44Encrypt(ck, "a".repeat(len)), Nip44CryptoError, undefined, `len=${len}`)
  }
})

Deno.test("nip44 invalid.encrypt_msg_lengths - the vector lengths of 65536 and over round-trip under the extended length format with a raised ceiling", () => {
  const ck = new Uint8Array(32).fill(1)
  const superseded = VECTORS.invalid.encrypt_msg_lengths.filter((len) => len >= EXTENDED_PREFIX_THRESHOLD)
  assertEquals(superseded, [65536, 100000, 10000000])
  for (const len of superseded) {
    const plaintext = "a".repeat(len)
    const payload = nip44Encrypt(ck, plaintext, NIP44_MAX_PLAINTEXT_SIZE)
    assertEquals(nip44Decrypt(ck, payload, NIP44_MAX_PLAINTEXT_SIZE), plaintext, `len=${len}`)
  }
})

interface ExtendedPrefixVector {
  readonly length: number
  readonly prefixLength: number
  readonly paddedLength: number
  readonly plaintextSha256: string
  readonly payloadSha256: string
}

const EXTENDED_PREFIX_VECTORS: ReadonlyArray<ExtendedPrefixVector> = [
  {
    length: 65535,
    prefixLength: 2,
    paddedLength: 65536,
    plaintextSha256: "6e1bebca6a8229364a162a72ef064826c4cd7457bf54f190ef782bd9deff3e42",
    payloadSha256: "6d8c2810d1e870fbaa1f0a0937126cca837a15f9260e27060c331d70a3c0bc84",
  },
  {
    length: 65536,
    prefixLength: 6,
    paddedLength: 65536,
    plaintextSha256: "bf718b6f653bebc184e1479f1935b8da974d701b893afcf49e701f3e2f9f9c5a",
    payloadSha256: "b7b4edb36ba92e267d322d56d9aebc22e7fa96ff52e3c12adc07f07a43cbc616",
  },
  {
    length: 65537,
    prefixLength: 6,
    paddedLength: 81920,
    plaintextSha256: "008ffc88d3c96a9f307524eb361e47c5222a887fc45fa0c1fb8d429c5c23b430",
    payloadSha256: "eeb7c7c5373894ea2c1547cfd3ccb15d5a0b2d619da852e5c79df792dcc9e435",
  },
]
const EXTENDED_PREFIX_KEY = requireBytes("c41c775356fd92eadc63ff5a0dc1da211b268cbea22316767095b2871ea1412d")
const EXTENDED_PREFIX_NONCE = requireBytes("0000000000000000000000000000000000000000000000000000000000000001")
const sha256Hex = (text: string): string => bytesToHex(sha256(new TextEncoder().encode(text)))

Deno.test("nip44 extended length prefix - spec vectors (sha256 of plaintext/payload)", () => {
  for (const v of EXTENDED_PREFIX_VECTORS) {
    const plaintext = "a".repeat(v.length)
    assertEquals(sha256Hex(plaintext), v.plaintextSha256, `plaintext sha256 len=${v.length}`)
    const payload = nip44v2.encrypt(plaintext, EXTENDED_PREFIX_KEY, EXTENDED_PREFIX_NONCE)
    assertEquals(sha256Hex(payload), v.payloadSha256, `payload sha256 len=${v.length}`)
    assertEquals(nip44Decrypt(EXTENDED_PREFIX_KEY, payload), plaintext, `round-trip len=${v.length}`)
  }
})

Deno.test("nip44 extended length prefix - spec vectors' padded length and prefix size", () => {
  for (const v of EXTENDED_PREFIX_VECTORS) {
    assertEquals(nip44v2.utils.calcPaddedLen(v.length), v.paddedLength, `len=${v.length}`)
    assertEquals(nip44v2.utils.pad("a".repeat(v.length)).length, v.prefixLength + v.paddedLength, `len=${v.length}`)
  }
})

Deno.test("nip44 pad - a length of 65536 or more is written as two zero bytes and a big-endian u32", () => {
  assertEquals(Array.from(nip44v2.utils.pad("a".repeat(65537)).subarray(0, 7)), [0, 0, 0, 1, 0, 1, 0x61])
})

Deno.test("nip44 calc_padded_len - lengths past 2^30 use the specification's 64-bit arithmetic", () => {
  assertEquals(nip44v2.utils.calcPaddedLen(2 ** 31 + 1), 2684354560)
  assertEquals(nip44v2.utils.calcPaddedLen(4294967295), 2 ** 32)
})

Deno.test("nip44 writeU32BE - refuses a length outside 65536 to 4294967295", () => {
  for (const len of [65535, 2 ** 32, 70000.5]) {
    assertThrows(() => nip44v2.utils.writeU32BE(len), Error, "invalid plaintext size", `len=${len}`)
  }
})

Deno.test("NIP44_MAX_PLAINTEXT_SIZE - is NIP-44's 4294967295 bytes", () => {
  assertEquals(NIP44_MAX_PLAINTEXT_SIZE, 4294967295)
})

const extendedPrefixOf = (length: number): Uint8Array => {
  const prefix = new Uint8Array(6)
  new DataView(prefix.buffer).setUint32(2, length)
  return prefix
}

Deno.test("nip44Decrypt - an extended prefix naming a length under 65536 is invalid padding", () => {
  const plaintext = new Uint8Array(100).fill(0x61)
  const padded = concatBytes(extendedPrefixOf(100), plaintext, new Uint8Array(nip44v2.utils.calcPaddedLen(100) - 100))
  assertThrows(
    () => nip44Decrypt(EXTENDED_PREFIX_KEY, nip44PayloadOfPadded(EXTENDED_PREFIX_KEY, padded)),
    Nip44CryptoError,
    "invalid padding",
  )
})

Deno.test("nip44Decrypt - an extended prefix naming a length of zero is invalid padding", () => {
  const padded = concatBytes(extendedPrefixOf(0), new Uint8Array(32))
  assertThrows(
    () => nip44Decrypt(EXTENDED_PREFIX_KEY, nip44PayloadOfPadded(EXTENDED_PREFIX_KEY, padded)),
    Nip44CryptoError,
    "invalid padding",
  )
})

Deno.test("nip44Decrypt - an extended prefix whose padding does not match its length is invalid padding", () => {
  const plaintext = new Uint8Array(65537).fill(0x61)
  const padded = concatBytes(extendedPrefixOf(65537), plaintext, new Uint8Array(100))
  assertThrows(
    () => nip44Decrypt(EXTENDED_PREFIX_KEY, nip44PayloadOfPadded(EXTENDED_PREFIX_KEY, padded)),
    Nip44CryptoError,
    "invalid padding",
  )
})

Deno.test("nip44Decrypt - the payload built for the extended-prefix cases decrypts when its prefix is well formed", () => {
  const plaintext = new Uint8Array(65537).fill(0x61)
  const padded = concatBytes(extendedPrefixOf(65537), plaintext, new Uint8Array(81920 - 65537))
  assertEquals(nip44Decrypt(EXTENDED_PREFIX_KEY, nip44PayloadOfPadded(EXTENDED_PREFIX_KEY, padded)), "a".repeat(65537))
})

Deno.test("nip44 invalid.decrypt - spec vectors all throw", () => {
  for (const v of VECTORS.invalid.decrypt) {
    assertThrows(() => nip44Decrypt(requireBytes(v.conversation_key), v.payload), Nip44CryptoError, undefined, v.note)
  }
})

Deno.test("nip44 round-trip - fixed key pairs and a fresh nonce", () => {
  const { sk: sk1, pk: pk1 } = keyPairOf(0x11)
  const { sk: sk2, pk: pk2 } = keyPairOf(0x22)
  const ck1 = getNip44ConversationKey(sk1, pk2)
  const ck2 = getNip44ConversationKey(sk2, pk1)
  assertEquals(bytesToHex(ck1), bytesToHex(ck2), "symmetric conversation key")
  const plaintext = "hello, nostr"
  const payload = nip44Encrypt(ck1, plaintext)
  assertEquals(nip44Decrypt(ck2, payload), plaintext)
})

Deno.test("nip44 vendored encrypt - rejects a nonce of the wrong length", () => {
  assertThrows(() => nip44v2.encrypt("hello", new Uint8Array(32).fill(1), new Uint8Array(16)), Error)
})

Deno.test("nip44Encrypt - takes no caller-chosen nonce: each call draws a fresh one", () => {
  const ck = new Uint8Array(32).fill(1)
  assertEquals(nip44Encrypt.length, 2)
  assert(nip44Encrypt(ck, "hello") !== nip44Encrypt(ck, "hello"))
})

Deno.test("NIP44 size constants match the codec's exported bounds", () => {
  assertEquals(NIP44_MIN_PLAINTEXT_SIZE, nip44v2.utils.minPlaintextSize)
  assertEquals(NIP44_MAX_PLAINTEXT_SIZE, nip44v2.utils.maxPlaintextSize)
})

const NOT_BYTES: Uint8Array = JSON.parse("null")
const NOT_A_PUBKEY: PublicKey = JSON.parse(`"${"a".repeat(62)}"`)
const PEER = keyPairOf(0x22).pk

Deno.test("nip44Encrypt - a conversation key that is not bytes is misuse and throws InvalidArgumentError", () => {
  assertThrows(() => nip44Encrypt(NOT_BYTES, "hello"), InvalidArgumentError)
})

Deno.test("nip44Encrypt - a conversation key of 31 bytes is misuse and throws InvalidArgumentError", () => {
  assertThrows(() => nip44Encrypt(new Uint8Array(31).fill(1), "hello"), InvalidArgumentError)
})

Deno.test("nip44Encrypt - a conversation key of 33 bytes is misuse and throws InvalidArgumentError", () => {
  assertThrows(() => nip44Encrypt(new Uint8Array(33).fill(1), "hello"), InvalidArgumentError)
})

Deno.test("nip44Decrypt - a conversation key of 31 bytes is misuse and throws InvalidArgumentError", () => {
  const payload = nip44Encrypt(new Uint8Array(32).fill(1), "hello")
  assertThrows(() => nip44Decrypt(new Uint8Array(31).fill(1), payload), InvalidArgumentError)
})

Deno.test("nip44Decrypt - a conversation key of 33 bytes is misuse and throws InvalidArgumentError", () => {
  const payload = nip44Encrypt(new Uint8Array(32).fill(1), "hello")
  assertThrows(() => nip44Decrypt(new Uint8Array(33).fill(1), payload), InvalidArgumentError)
})

Deno.test("getNip44ConversationKey - a secret key that is not bytes is misuse and throws InvalidArgumentError", () => {
  assertThrows(() => getNip44ConversationKey(NOT_BYTES, PEER), InvalidArgumentError)
})

Deno.test("getNip44ConversationKey - a secret key of 31 bytes is misuse and throws InvalidArgumentError", () => {
  assertThrows(() => getNip44ConversationKey(new Uint8Array(31).fill(1), PEER), InvalidArgumentError)
})

Deno.test("getNip44ConversationKey - a secret key of 33 bytes is misuse and throws InvalidArgumentError", () => {
  assertThrows(() => getNip44ConversationKey(new Uint8Array(33).fill(1), PEER), InvalidArgumentError)
})

Deno.test("getNip44ConversationKey - a peer key that is not 64 lowercase hex characters is misuse and throws InvalidArgumentError", () => {
  assertThrows(() => getNip44ConversationKey(keyPairOf(0x11).sk, NOT_A_PUBKEY), InvalidArgumentError)
})

Deno.test("nip44Decrypt - a payload whose base64 sets its unused trailing bits throws, being no canonical encoding (shared ADR-0095)", () => {
  const conversationKey = getNip44ConversationKey(keyPairOf(0x11).sk, keyPairOf(0x22).pk)
  const payload = nip44Encrypt(conversationKey, "x".repeat(33))
  assert(payload.endsWith("="), "a 131-byte payload ends in padding")
  assertThrows(() => nip44Decrypt(conversationKey, withTrailingBitSet(payload)), Nip44CryptoError)
})

Deno.test("nip44Decrypt - keeps a leading byte order mark, reading the plaintext exactly as written (shared ADR-0100)", () => {
  const conversationKey = getNip44ConversationKey(keyPairOf(0x11).sk, keyPairOf(0x22).pk)
  const plaintext = "\uFEFFhello bob"
  assertEquals(nip44Decrypt(conversationKey, nip44Encrypt(conversationKey, plaintext)), plaintext)
})

Deno.test("nip44Decrypt - a plaintext that is not valid UTF-8 throws Nip44CryptoError, since NIP-44's plaintext is a UTF-8 string (shared ADR-0100)", () => {
  const conversationKey = getNip44ConversationKey(keyPairOf(0x11).sk, keyPairOf(0x22).pk)
  assertThrows(() => nip44Decrypt(conversationKey, nip44PayloadOf(conversationKey, INVALID_UTF8)), Nip44CryptoError)
})

Deno.test("nip44Decrypt - the payload built for the invalid-UTF-8 case decrypts when its plaintext is valid UTF-8", () => {
  const conversationKey = getNip44ConversationKey(keyPairOf(0x11).sk, keyPairOf(0x22).pk)
  const payload = nip44PayloadOf(conversationKey, new TextEncoder().encode("hello"))
  assertEquals(nip44Decrypt(conversationKey, payload), "hello")
})

Deno.test("nip44 pad - refuses an empty plaintext with the NIP's range check, as nostr-tools does", () => {
  assertThrows(() => nip44v2.utils.pad(""), Error, "invalid plaintext size: must be between 1 and 4294967295 bytes")
})

const CK = new Uint8Array(32).fill(1)

const shortPrefixOf = (length: number): Uint8Array => nip44v2.utils.writeU16BE(length)

Deno.test("nip44Decrypt - a MAC-valid payload whose padding is not all zero bytes is invalid padding (shared ADR-0102)", () => {
  const padded = concatBytes(shortPrefixOf(5), new TextEncoder().encode("hello"), new Uint8Array(27))
  padded[padded.length - 1] = 7
  assertThrows(() => nip44Decrypt(CK, nip44PayloadOfPadded(CK, padded)), Nip44CryptoError, "invalid padding")
})

Deno.test("nip44Decrypt - an extended prefix whose padding is not all zero bytes is invalid padding (shared ADR-0102)", () => {
  const padded = concatBytes(extendedPrefixOf(65537), new Uint8Array(65537).fill(0x61), new Uint8Array(81920 - 65537))
  padded[padded.length - 1] = 1
  assertThrows(() => nip44Decrypt(CK, nip44PayloadOfPadded(CK, padded)), Nip44CryptoError, "invalid padding")
})

Deno.test("nip44Decrypt - the payload built for the non-zero padding case decrypts when its padding is zero", () => {
  const padded = concatBytes(shortPrefixOf(5), new TextEncoder().encode("hello"), new Uint8Array(27))
  assertEquals(nip44Decrypt(CK, nip44PayloadOfPadded(CK, padded)), "hello")
})

Deno.test("nip44Encrypt - a plaintext holding a lone surrogate, which has no UTF-8 encoding, is refused (shared ADR-0100)", () => {
  const conversationKey = getNip44ConversationKey(keyPairOf(0x11).sk, keyPairOf(0x22).pk)
  assertThrows(() => nip44Encrypt(conversationKey, "a\uDC00b"), Nip44CryptoError, "UTF-8")
})

Deno.test("nip44Encrypt - a plaintext ending in a lone high surrogate is refused (shared ADR-0100)", () => {
  const conversationKey = getNip44ConversationKey(keyPairOf(0x11).sk, keyPairOf(0x22).pk)
  assertThrows(() => nip44Encrypt(conversationKey, "a\uD83D"), Nip44CryptoError, "UTF-8")
})

Deno.test("nip44Encrypt - a surrogate pair is well-formed and round-trips", () => {
  const conversationKey = getNip44ConversationKey(keyPairOf(0x11).sk, keyPairOf(0x22).pk)
  const plaintext = "a😀b"
  assertEquals(nip44Decrypt(conversationKey, nip44Encrypt(conversationKey, plaintext)), plaintext)
})
