import type { AddressableEventRef } from "./addressable-ref.ts"
import { formatAddressableRef } from "./addressable-ref.ts"
import type { EventId } from "./event-id.ts"

/**
 * A reference to a parent event in NIP-10 / NIP-22 reply graphs, reposts, reactions and highlights: either one
 * specific event by its hex id (`type: "event"`, as an `e` / `E` tag carries it) or the latest version of an
 * addressable event by its coordinate (`type: "address"`, as an `a` / `A` tag carries it).
 * Parse untrusted strings with `parseEventOrAddressRef`; key `Map`s and `Set`s with {@link formatEventOrAddressRef}.
 */
export type EventOrAddressRef =
  | { readonly type: "event"; readonly id: EventId }
  | { readonly type: "address"; readonly address: AddressableEventRef }

/**
 * The canonical wire and storage form of `ref`: the hex event id, or the NIP-01 `kind:pubkey:d` coordinate
 * (the `a`-tag value). Two refs point at the same target exactly when their formatted forms are equal, so this
 * is also the key to use in a `Map` or `Set`.
 */
export const formatEventOrAddressRef = (ref: EventOrAddressRef): string =>
  ref.type === "event" ? ref.id : formatAddressableRef(ref.address)
