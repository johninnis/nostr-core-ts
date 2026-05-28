/**
 * Cryptographic RNG primitives.
 *
 * Treated as a domain-level leaf capability (same status as `now` over `Date.now()`):
 * `crypto.getRandomValues` is part of the JS platform, not "infrastructure" in the
 * clean-architecture sense, so we expose ready-to-use functions rather than ports.
 *
 * For tests or hardware-backed RNGs that need to inject a different source, use the type
 * aliases ({@link RandomBytesFn} / {@link RandomUint32Fn}) to declare a parameter, and pass
 * `randomBytes` / `randomUint32` as the default.
 */

/** Returns `length` cryptographically-random bytes. Default: {@link randomBytes} (web-crypto). */
export type RandomBytesFn = (length: number) => Uint8Array

/** Returns a single cryptographically-random 32-bit unsigned integer in `[0, 2^32)`. Default: {@link randomUint32}. */
export type RandomUint32Fn = () => number

/** Cryptographically-random `length` bytes, sourced from the Web Crypto API. */
export const randomBytes: RandomBytesFn = (length: number): Uint8Array => crypto.getRandomValues(new Uint8Array(length))

/** A single cryptographically-random 32-bit unsigned integer in `[0, 2^32)`. */
export const randomUint32: RandomUint32Fn = (): number => {
  const value = crypto.getRandomValues(new Uint32Array(1))[0]
  // Unreachable: getRandomValues always populates a length-1 buffer. The guard
  // exists to satisfy `noUncheckedIndexedAccess` without lying — i.e. without
  // a silent `?? 0` fallback that would return a non-random zero on failure.
  if (value === undefined) throw new Error("crypto.getRandomValues returned empty buffer")
  return value
}
