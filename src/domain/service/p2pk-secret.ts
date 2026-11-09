import { isArrayOf, isRecord, isString } from "./guards.ts"
import { parseJson } from "./json.ts"
import { lowerAscii } from "../value-object/ascii-case.ts"
import type { PublicKey } from "../value-object/public-key.ts"
import { parsePublicKey } from "../value-object/public-key.ts"

const P2PK_KIND = "P2PK"
const COMPRESSED_PREFIXES: ReadonlySet<string> = new Set(["02", "03"])
const TAGS_THAT_KEEP_ONE_SPENDER: ReadonlyArray<readonly [string, string]> = [
  ["sigflag", "SIG_INPUTS"],
  ["sigflag", "SIG_ALL"],
  ["n_sigs", "1"],
]

// Deliberate: read by its lower-case x-coordinate whatever its prefix or case, as NUT-11 compares keys — see shared ADR-0128
/**
 * The x-coordinate of a compressed secp256k1 key as Cashu writes one: a `02` or `03` prefix and 32 bytes of hex in
 * either case, read as NUT-11 compares keys, by its lower-case x-coordinate (shared ADR-0128). `null` for any other
 * value, a bare x-coordinate included.
 */
export const parseCompressedKey = (key: string): PublicKey | null => {
  const lowered = lowerAscii(key)
  return COMPRESSED_PREFIXES.has(lowered.slice(0, 2)) ? parsePublicKey(lowered.slice(2)) : null
}

const keepsOneSpender = (tag: unknown): tag is readonly [string, string] =>
  Array.isArray(tag) && tag.length === 2 &&
  TAGS_THAT_KEEP_ONE_SPENDER.some(([name, value]) => tag[0] === name && tag[1] === value)

// Deliberate: only the tags that leave the proof spendable by its one key are read; anything else, a tag no NUT defines yet or a repeat NUT-11 calls unspendable, locks it to no key — see shared ADR-0128
const namesOnlyTheLock = (fields: Readonly<Record<string, unknown>>): boolean => {
  if (!Object.hasOwn(fields, "tags")) return true
  const tags = fields.tags
  return isArrayOf(tags, keepsOneSpender) && new Set(tags.map(([name]) => name)).size === tags.length
}

// Deliberate: a lock whose secret could let any other key spend the proof, or no key at all, locks it to no key — see shared ADR-0128
/**
 * The key a Cashu proof's `secret` locks it to alone (shared ADR-0128): the x-coordinate of the `data` of a NUT-10
 * secret of kind `P2PK` — a JSON array of `"P2PK"` and an object whose `nonce` and `data` are strings — when `data` is a
 * compressed key and each of its `tags`, if present, is exactly `["sigflag", "SIG_INPUTS"]`, `["sigflag", "SIG_ALL"]` or
 * `["n_sigs", "1"]`, no name twice. `null` for any other secret, read without throwing.
 */
export const parseP2pkLockKey = (secret: string): PublicKey | null => {
  const decoded = parseJson(secret)
  if (!decoded.success || !Array.isArray(decoded.value) || decoded.value.length !== 2) return null
  const [kind, fields] = decoded.value
  if (kind !== P2PK_KIND || !isRecord(fields) || !isString(fields.nonce) || !isString(fields.data)) return null
  return namesOnlyTheLock(fields) ? parseCompressedKey(fields.data) : null
}
