import { cbc } from "@noble/ciphers/aes"
import { chacha20 } from "@noble/ciphers/chacha"
import { concatBytes } from "@noble/hashes/utils"
import { base64 } from "@scure/base"
import { v2 as nip44v2 } from "../../src/infrastructure/crypto/nip44-v2.ts"
import { sharedX } from "../../src/infrastructure/crypto/shared-x.ts"
import type { PublicKey } from "../../src/domain/value-object/public-key.ts"

/** Bytes that are not UTF-8: a lone continuation byte and a byte UTF-8 never uses. */
export const INVALID_UTF8: Uint8Array = Uint8Array.of(0x68, 0x80, 0xff)

/** A NIP-04 payload from `secretKey` to `peerPubkey` whose plaintext is exactly `plaintext`, valid UTF-8 or not. */
export const nip04PayloadOf = (secretKey: Uint8Array, peerPubkey: PublicKey, plaintext: Uint8Array): string => {
  const iv = new Uint8Array(16).fill(9)
  const ciphertext = cbc(sharedX(secretKey, peerPubkey), iv).encrypt(plaintext)
  return `${base64.encode(ciphertext)}?iv=${base64.encode(iv)}`
}

/** A NIP-44 v2 payload over `conversationKey` whose plaintext is exactly `plaintext`, valid UTF-8 or not. */
export const nip44PayloadOf = (conversationKey: Uint8Array, plaintext: Uint8Array): string => {
  const padding = new Uint8Array(nip44v2.utils.calcPaddedLen(plaintext.length) - plaintext.length)
  return nip44PayloadOfPadded(
    conversationKey,
    concatBytes(nip44v2.utils.writeU16BE(plaintext.length), plaintext, padding),
  )
}

/** A NIP-44 v2 payload over `conversationKey` whose padded plaintext, length prefix included, is exactly `padded`. */
export const nip44PayloadOfPadded = (conversationKey: Uint8Array, padded: Uint8Array): string => {
  const { utils } = nip44v2
  const nonce = new Uint8Array(32).fill(5)
  const { chacha_key, chacha_nonce, hmac_key } = utils.getMessageKeys(conversationKey, nonce)
  const ciphertext = chacha20(chacha_key, chacha_nonce, padded)
  const mac = utils.hmacAad(hmac_key, ciphertext, nonce)
  return base64.encode(concatBytes(Uint8Array.of(2), nonce, ciphertext, mac))
}
