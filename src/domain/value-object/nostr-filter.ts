import type { EventId } from "./event-id.ts"
import type { PublicKey } from "./public-key.ts"

type TagFilterLetter =
  | "a"
  | "b"
  | "c"
  | "d"
  | "e"
  | "f"
  | "g"
  | "h"
  | "i"
  | "j"
  | "k"
  | "l"
  | "m"
  | "n"
  | "o"
  | "p"
  | "q"
  | "r"
  | "s"
  | "t"
  | "u"
  | "v"
  | "w"
  | "x"
  | "y"
  | "z"
  | "A"
  | "B"
  | "C"
  | "D"
  | "E"
  | "F"
  | "G"
  | "H"
  | "I"
  | "J"
  | "K"
  | "L"
  | "M"
  | "N"
  | "O"
  | "P"
  | "Q"
  | "R"
  | "S"
  | "T"
  | "U"
  | "V"
  | "W"
  | "X"
  | "Y"
  | "Z"

/** The single-letter tag conditions of a NIP-01 filter: `"#<single-letter (a-zA-Z)>"`, and no other `#` key. */
type TagFilters = { readonly [Key in `#${TagFilterLetter}`]?: ReadonlyArray<string> | undefined }

/**
 * NIP-01 `REQ` filter — selects events by id / author / kind / time range / tag value. Tag conditions are keyed `#`
 * plus one letter, `a`–`z` or `A`–`Z`, as NIP-01 defines them; `ids`, `authors`, `#e` and `#p` are branded, because
 * NIP-01 says those lists MUST hold exact 64-character lowercase hex. See `compileFilter` for the matching semantics.
 */
export interface NostrFilter extends TagFilters {
  readonly ids?: ReadonlyArray<EventId> | undefined
  readonly authors?: ReadonlyArray<PublicKey> | undefined
  readonly kinds?: ReadonlyArray<number> | undefined
  readonly since?: number | undefined
  readonly until?: number | undefined
  readonly limit?: number | undefined
  readonly search?: string | undefined
  readonly "#e"?: ReadonlyArray<EventId> | undefined
  readonly "#p"?: ReadonlyArray<PublicKey> | undefined
}
