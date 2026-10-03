import type { NostrEvent } from "../value-object/nostr-event.ts"

/**
 * Serialise a signed event as NIP-01 JSON: its seven fields, `id`, `pubkey`, `created_at`, `kind`, `tags`, `content`
 * and `sig`, in that order, and no other key the object carries. Every place this package writes an event — a relay
 * message, a repost's content, a NIP-98 header, a gift-wrapped seal — writes it through here.
 */
export const serialiseEvent = ({ id, pubkey, created_at, kind, tags, content, sig }: NostrEvent): string =>
  JSON.stringify({ id, pubkey, created_at, kind, tags, content, sig })
