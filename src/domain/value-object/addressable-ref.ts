import type { PublicKey } from "./public-key.ts"
import { isValidPublicKey } from "./public-key.ts"

/** NIP-01 addressable-event coordinate `(kind, pubkey, d-tag)` — the value-object form of an `a`-tag value or `naddr` payload. */
export interface AddressableEventRef {
  readonly kind: number
  readonly pubkey: PublicKey
  readonly dTag: string
}

/** Format an addressable coordinate as the NIP-01 `kind:pubkey:d` string used in `a` tags and `naddr` payloads. */
export const formatAddressableRef = (ref: AddressableEventRef): string => `${ref.kind}:${ref.pubkey}:${ref.dTag}`

const ADDRESS_REGEX = /^(\d+):([0-9a-f]{64}):(.*)$/

/** Parse an `a` tag value (`kind:pubkey:d`) into an addressable coordinate; returns `null` if malformed. */
export const parseAddressableRef = (value: string): AddressableEventRef | null => {
  const match = ADDRESS_REGEX.exec(value)
  if (!match) return null
  const kind = Number(match[1])
  const pubkey = match[2]
  const dTag = match[3]
  if (!Number.isSafeInteger(kind) || pubkey === undefined || dTag === undefined) return null
  if (!isValidPublicKey(pubkey)) return null
  return { kind, pubkey, dTag }
}
