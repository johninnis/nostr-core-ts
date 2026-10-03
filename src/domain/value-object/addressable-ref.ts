import type { PublicKey } from "./public-key.ts"
import { isValidPublicKey } from "./public-key.ts"
import { kindCategory } from "./kinds.ts"

/**
 * NIP-01 addressable-event coordinate `(kind, pubkey, d-tag)` — the value-object form of an `a`-tag value or `naddr`
 * payload.
 */
export interface AddressableEventRef {
  readonly kind: number
  readonly pubkey: PublicKey
  readonly dTag: string
}

/** Format an addressable coordinate as the NIP-01 `kind:pubkey:d` string used in `a` tags and `naddr` payloads. */
export const formatAddressableRef = (ref: AddressableEventRef): string => `${ref.kind}:${ref.pubkey}:${ref.dTag}`

/**
 * `true` when `ref` names an event NIP-01 can address: an addressable kind (30000–39999) with any `d`, including the
 * empty one, or a replaceable kind (0, 3, 10000–19999) with the empty `d` its `a` tag and `naddr` carry.
 */
export const isValidAddressableRef = ({ kind, dTag }: AddressableEventRef): boolean => {
  const category = kindCategory(kind)
  return category === "addressable" || (category === "replaceable" && dTag === "")
}

const ADDRESS_REGEX = /^(0|[1-9][0-9]*):([0-9a-f]{64}):([\s\S]*)$/

/**
 * Parse an `a` tag value (`kind:pubkey:d`) into an addressable coordinate; `null` if malformed or not
 * {@link isValidAddressableRef}. The kind must be in canonical decimal form, without a sign or a leading zero; the
 * identifier is everything after the second colon, any string a `d` tag can hold, newlines included.
 */
export const parseAddressableRef = (value: string): AddressableEventRef | null => {
  const match = ADDRESS_REGEX.exec(value)
  if (!match) return null
  const kind = Number(match[1])
  const pubkey = match[2]
  const dTag = match[3]
  if (!Number.isSafeInteger(kind) || pubkey === undefined || dTag === undefined) return null
  if (!isValidPublicKey(pubkey)) return null
  const ref = { kind, pubkey, dTag }
  return isValidAddressableRef(ref) ? ref : null
}
