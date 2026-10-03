import { isValidTag } from "../../domain/value-object/nostr-event.ts"
import type { NostrEvent, Tag } from "../../domain/value-object/nostr-event.ts"
import type { Result } from "../../domain/value-object/result.ts"
import { failure, ok } from "../../domain/value-object/result.ts"
import type { PeerCipher } from "../../domain/service/peer-cipher.ts"
import { verifyEventSignature } from "../../domain/service/verify.ts"
import type { PrivateEntriesFailure } from "../failure/private-entries-failure.ts"
import { cipherSchemeOf } from "../../domain/service/cipher-scheme.ts"
import { createJsonCipher } from "./json-crypto.ts"

/**
 * Decrypt the private entries of the NIP-51 list event `list` from its author and read them as a JSON array of tags;
 * empty content is an empty list and malformed tag rows are dropped. The list's signature is verified first, and one
 * that does not verify is `signature-invalid`, its content never decrypted (NIP-44: "Before decryption, the event's
 * pubkey and signature MUST be validated as defined in NIP 01"). Content carrying NIP-04's `?iv=` separator was written
 * under the deprecated NIP-04 scheme and is decrypted with it (NIP-51: clients "can automatically discover if the
 * encryption is NIP-04 or NIP-44 by searching for "iv" in the ciphertext"); anything else is NIP-44. A payload that
 * decrypts to JSON other than an array is `json-shape-mismatch`.
 */
export const decryptPrivateEntries = async (
  cipher: PeerCipher,
  list: NostrEvent,
): Promise<Result<ReadonlyArray<Tag>, PrivateEntriesFailure>> => {
  if (!verifyEventSignature(list)) return failure({ type: "signature-invalid" })
  if (list.content === "") return ok([])
  const decrypted = await createJsonCipher(cipher, cipherSchemeOf(list.content)).decrypt(list.pubkey, list.content)
  if (!decrypted.success) return decrypted
  if (!Array.isArray(decrypted.value)) return failure({ type: "json-shape-mismatch" })
  return ok(decrypted.value.filter(isValidTag))
}
