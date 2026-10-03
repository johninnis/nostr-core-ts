import type { EventOrAddressRef } from "./event-or-address-ref.ts"
import type { HttpUrl } from "./http-url.ts"
import { formatEventOrAddressRef } from "./event-or-address-ref.ts"

/**
 * External content a NIP-22 comment is scoped to by an `I` / `i` tag (NIP-73): its `id` is the tag value (a URL,
 * `isbn:…`, `geo:…`, `#topic`, `podcast:item:guid:…`, …), its `kind` the paired `K` / `k` value (`web`, `isbn`,
 * `geo`, `#`, `podcast:item:guid`, …), and its `hint` the web page NIP-73's "url hint" redirects people to, or `null`
 * when none is stated (shared ADR-0090).
 */
export interface ExternalContentRef {
  readonly type: "external"
  readonly id: string
  readonly kind: string
  readonly hint: HttpUrl | null
}

/**
 * What a reply threads to: an event by id (`e` / `E`), an addressable event by coordinate (`a` / `A`), or, for a NIP-22
 * comment, external content (`i` / `I`). Two refs name the same target exactly when their `type`s are equal and their
 * {@link formatThreadRef} forms are equal: an external id may be spelled like an event id or a coordinate.
 */
export type ThreadRef = EventOrAddressRef | ExternalContentRef

/**
 * The canonical form of `ref`: the hex event id, the `kind:pubkey:d` coordinate, or the NIP-73 external id — each the
 * value its tag carries. Refs of different types may share a formatted form, so compare their `type`s too.
 */
export const formatThreadRef = (ref: ThreadRef): string =>
  ref.type === "external" ? ref.id : formatEventOrAddressRef(ref)
