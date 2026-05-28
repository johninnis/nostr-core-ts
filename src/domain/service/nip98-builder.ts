import { base64 } from "@scure/base"
import { KIND_HTTP_AUTH } from "../value-object/kinds.ts"
import type { NostrEvent, Tag, UnsignedEvent } from "../value-object/nostr-event.ts"
import { textEncoder } from "../value-object/text-codec.ts"
import { now } from "../value-object/timestamp.ts"
import { sha256Hex } from "./sha256.ts"

/** Default `expiration` tag offset (seconds from now) for `buildNip98AuthEvent`. */
export const DEFAULT_AUTH_EXPIRATION_SECONDS = 60

/** Prefix marking a NIP-98 `Authorization` header value; the bytes after it are base64-encoded JSON. */
export const NIP98_AUTH_HEADER_PREFIX = "Nostr "

/** Input for `buildNip98AuthEvent` — request URL, HTTP method, optional body (hashed into a `payload` tag when present), and optional expiry / pinned-`created_at` overrides. */
export interface BuildNip98AuthEventInput {
  readonly url: string
  readonly method: string
  /** Request body. An empty string (or omitted) means no `payload` tag is emitted. */
  readonly body?: string
  /**
   * Seconds-from-now that the event expires. When set, an `expiration` tag is emitted and
   * the validator (with default options) will reject the event past that timestamp.
   */
  readonly expiresInSeconds?: number
  /** Pin the `created_at` (and the `expiration` base, if `expiresInSeconds` is set). Defaults to the system clock ({@link now}). */
  readonly createdAt?: number
}

/**
 * Build a kind-27235 NIP-98 auth event for an HTTP request. The `payload` tag is computed
 * via SHA-256 of `body` when non-empty; this matches the validator side, which hashes the
 * inbound body itself. Both sides own their own hashing — callers never compute SHA-256
 * themselves. Pass `expiresInSeconds` to emit a NIP-98 `expiration` tag.
 */
export const buildNip98AuthEvent = async (input: BuildNip98AuthEventInput): Promise<UnsignedEvent> => {
  const createdAt = input.createdAt ?? now()
  const tags: Array<Tag> = [
    ["u", input.url],
    ["method", input.method],
  ]
  if (input.body !== undefined && input.body !== "") {
    tags.push(["payload", await sha256Hex(input.body)])
  }
  if (input.expiresInSeconds !== undefined) {
    tags.push(["expiration", String(createdAt + input.expiresInSeconds)])
  }
  return {
    kind: KIND_HTTP_AUTH,
    content: "",
    created_at: createdAt,
    tags,
  }
}

/** Encode a signed NIP-98 auth event as the `Authorization: Nostr <base64-json>` header value. */
export const encodeAuthHeader = (event: NostrEvent): string =>
  `${NIP98_AUTH_HEADER_PREFIX}${base64.encode(textEncoder.encode(JSON.stringify(event)))}`
