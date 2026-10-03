import type { PublicKey } from "./public-key.ts"

/**
 * A NIP-17 chat room as its sender addresses it: the `sender`, whose key the rumour is written under, and the
 * `receivers` its `p` tags name (NIP-17: "The set of `pubkey` + `p` tags defines a chat room"). A receiver equal to the
 * sender is the sender, not a receiver; a room with no other receiver is the sender's note to self (shared ADR-0074).
 * One value because both fields are the room's members.
 */
export interface ChatRoom {
  readonly sender: PublicKey
  readonly receivers: ReadonlyArray<PublicKey>
}
