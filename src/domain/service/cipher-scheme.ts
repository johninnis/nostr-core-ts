/** The encryption a JSON payload travels under: NIP-44, or NIP-04 for legacy peers that cannot do NIP-44. */
export type CipherScheme = "nip44" | "nip04"

/** The separator between a NIP-04 payload's base64 ciphertext and its base64 IV: `<ciphertext>?iv=<iv>`. */
export const NIP04_IV_SEPARATOR = "?iv="

/**
 * The scheme `ciphertext` was written under, read from the payload itself: NIP-04 when it carries NIP-04's `?iv=`
 * separator, which NIP-44's base64 payload cannot contain, and NIP-44 otherwise (NIP-51: clients "can automatically
 * discover if the encryption is NIP-04 or NIP-44 by searching for "iv" in the ciphertext").
 */
export const cipherSchemeOf = (ciphertext: string): CipherScheme =>
  ciphertext.includes(NIP04_IV_SEPARATOR) ? "nip04" : "nip44"
