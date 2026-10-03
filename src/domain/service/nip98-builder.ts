import { KIND_HTTP_AUTH } from "../value-object/kinds.ts"
import type { Tag, UnsignedEvent } from "../value-object/nostr-event.ts"
import { now } from "./timestamp.ts"
import { sha256Hex } from "./sha256.ts"
import type { HttpUrl } from "../value-object/http-url.ts"
import { InvalidArgumentError } from "../exception/invalid-argument-error.ts"
import { isNonNegativeInteger } from "./guards.ts"

/**
 * Input for `buildNip98AuthEvent` — request URL, HTTP method, optional body (hashed into a `payload` tag when present),
 * and optional expiry / pinned-`created_at` overrides.
 */
export interface BuildNip98AuthEventInput {
  readonly url: HttpUrl
  readonly method: string
  /** Request body, text or bytes. An empty one, or none, means no `payload` tag is emitted. */
  readonly body?: string | Uint8Array
  /**
   * Seconds from `createdAt` until the event expires. When set, an `expiration` tag is emitted and a validator refuses
   * the event once that time has passed.
   */
  readonly expiresInSeconds?: number
  /**
   * Pin the `created_at` (and the `expiration` base, if `expiresInSeconds` is set). Defaults to the system clock
   * ({@link now}).
   */
  readonly createdAt?: number
}

const expirationOf = (createdAt: number, expiresInSeconds: number): string => {
  const expiration = createdAt + expiresInSeconds
  if (!isNonNegativeInteger(expiresInSeconds) || !isNonNegativeInteger(expiration)) {
    throw new InvalidArgumentError(
      `A NIP-98 event expires a whole number of seconds after created_at, at a safe integer, not ${expiresInSeconds}`,
    )
  }
  return String(expiration)
}

/**
 * Build a kind-27235 NIP-98 auth event for an HTTP request. The `u` tag names `url`, an `HttpUrl` and so already in the
 * form a validator compares it in. The `payload` tag is computed via SHA-256 of `body` when non-empty, as
 * `validateAuthHeader` hashes the inbound body itself, so a caller holding the body never hashes it. Pass
 * `expiresInSeconds` to emit a NIP-98 `expiration` tag; one that is not a whole number of seconds of zero or more, or
 * that puts the expiration beyond the safe integer range, throws `InvalidArgumentError`.
 */
export const buildNip98AuthEvent = (input: BuildNip98AuthEventInput): UnsignedEvent => {
  const createdAt = input.createdAt ?? now()
  const tags: Array<Tag> = [
    ["u", input.url],
    ["method", input.method],
  ]
  if (input.body !== undefined && input.body.length > 0) {
    tags.push(["payload", sha256Hex(input.body)])
  }
  if (input.expiresInSeconds !== undefined) tags.push(["expiration", expirationOf(createdAt, input.expiresInSeconds)])
  return {
    kind: KIND_HTTP_AUTH,
    content: "",
    created_at: createdAt,
    tags,
  }
}
