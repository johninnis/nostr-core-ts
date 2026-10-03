import { randomBytes as nobleRandomBytes } from "@noble/hashes/utils"

/** Returns a single cryptographically-random 32-bit unsigned integer in `[0, 2^32)`. Default: {@link randomUint32}. */
export type RandomUint32Fn = () => number

// Deliberate: the RNG is ambient, not a port; services that use it take an optional override — see ADR-0007
/**
 * Cryptographically-random `length` bytes from the Web Crypto API, by way of `@noble/hashes`, as the NIP-44 cipher
 * draws its nonce.
 */
export const randomBytes: (length: number) => Uint8Array = nobleRandomBytes

/** A single cryptographically-random 32-bit unsigned integer in `[0, 2^32)`. */
export const randomUint32: RandomUint32Fn = (): number => new DataView(randomBytes(4).buffer).getUint32(0)
