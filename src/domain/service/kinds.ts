import { KIND_CONTACT_LIST, KIND_GENERIC_REPOST, KIND_METADATA, KIND_REPOST } from "../value-object/kinds.ts"

export const REPOST_KINDS: ReadonlyArray<number> = [KIND_REPOST, KIND_GENERIC_REPOST]

const REPLACEABLE_RANGE_START = 10000
const REPLACEABLE_RANGE_END = 19999
const PARAM_REPLACEABLE_RANGE_START = 30000
const PARAM_REPLACEABLE_RANGE_END = 39999
const REPLACEABLE_SINGLE_KINDS: ReadonlySet<number> = new Set([KIND_METADATA, KIND_CONTACT_LIST])

/** `true` for kinds that follow NIP-01 replaceable semantics (kind 0/3 or 10000–19999). */
export const isReplaceable = (kind: number): boolean =>
  REPLACEABLE_SINGLE_KINDS.has(kind) ||
  (kind >= REPLACEABLE_RANGE_START && kind <= REPLACEABLE_RANGE_END)

/** `true` for parameterised-replaceable kinds (30000–39999), which key on `(pubkey, kind, d)`. */
export const isParameterisedReplaceable = (kind: number): boolean =>
  kind >= PARAM_REPLACEABLE_RANGE_START && kind <= PARAM_REPLACEABLE_RANGE_END

/** `true` when `kind` is a NIP-18 repost (kind 6 or 16). */
export const isRepostKind = (kind: number): boolean => REPOST_KINDS.includes(kind)
