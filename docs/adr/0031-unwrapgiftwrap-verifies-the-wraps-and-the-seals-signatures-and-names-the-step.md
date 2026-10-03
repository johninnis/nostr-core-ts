# 0031. `unwrapGiftWrap` verifies the wrap's and the seal's signatures and names the step that failed

## Status

Accepted

## Context

Shared ADR-0073 decides the checks that open a gift wrap, in order: the outer event's kind and signature, the seal's decryption, form, kind and signature, and the rumour's decryption, form, id and author, where the rumour must state its id (NIP-17: "Fields `id` and `created_at` are required") and that id must be the one its fields compute to. The seal is the only layer the sender signs, so an unverified seal lets anyone who can encrypt to the recipient name any sender; the wrap's signature binds the ephemeral key the outer ciphertext came from. `unwrapGiftWrap` used to check neither signature. Verifying both costs two Schnorr verifications per wrap, which invites making them optional for a caller that verified the wrap on receipt.

The seal's tags are contested by the NIPs themselves. NIP-59 says "Tags MUST always be empty in a `kind:13`. The inner event MUST always be unsigned." and later "When adding expiration tags to both `seal` and `gift wrap` layers, implementations SHOULD use independent random timestamps for each layer. Using different `created_at` values increases timing variance and helps protect against metadata correlation attacks." NIP-17 says "Clients MAY offer disappearing messages by setting an `expiration` tag in the gift wrap of each receiver or by not generating a gift wrap to the sender's public key. This tag SHOULD be included on the `kind:13` seal as well, in case it leaks."

## Decision

`unwrapGiftWrap(cipher, giftWrap)` takes a `PeerCipher`, since it only decrypts, and returns the first failing step as a `GiftWrapUnwrapFailure` literal: `not-gift-wrap`, `wrap-signature-invalid`, `seal-decrypt-failed`, `seal-malformed`, `seal-wrong-kind`, `seal-signature-invalid`, `rumour-decrypt-failed`, `rumour-signed`, `rumour-malformed`, `rumour-id-mismatch`, `rumour-pubkey-mismatch`. Both signature checks always run. A layer the cipher cannot decrypt, or whose ciphertext is empty, is `seal-decrypt-failed` or `rumour-decrypt-failed`; a layer that decrypts to text that is not JSON did decrypt, so it is `seal-malformed` or `rumour-malformed`, as the PHP nostr-core's `GiftWrapper` reports it. A rumour is read by `parseRumour`: one that states no `id` lacks a required field and is `rumour-malformed`, as one missing `created_at` is; `rumour-id-mismatch` is kept for an `id` that is stated and is not the one its fields compute to.

A seal whose only tags are `expiration` tags is accepted, by ruling (shared ADR-0073): NIP-17 asks for the wrap's expiration on the seal too, so a seal written that way must open. Each tag must name a canonical decimal Unix timestamp, as `isEventExpired` reads one (shared ADR-0011); any other seal tag, or an `expiration` whose value is not such a timestamp, is `seal-malformed`. Several `expiration` tags are accepted; `expiration` is not single-valued (shared ADR-0014) and their meaning together is shared ADR-0011's. A seal whose expiry has passed still opens: unwrapping does not decide what the caller shows. `buildDmGiftWraps` writes no `expiration` on a gift wrap, so it writes none on the seal; a builder that adds one to the wrap must add it to the seal as well, with the two `created_at` values drawn independently, as they already are.

The rumour may be of any kind, as shared ADR-0073 decides: `buildDmGiftWraps` wraps any rumour, and a NIP-17 kind 15 file message, a kind 7 reaction or another protocol's payload is as valid as a kind 14 message. There is no `rumour-wrong-kind` failure; the caller dispatches on `rumour.kind`.

## Consequences

- An unwrapped rumour's sender is a key that signed for it.
- A caller that already verified the wrap on receipt verifies it again. The check is not made optional, because a wrap handed in from a cache or another process has no such guarantee.
- Adding a failure literal is a breaking change for every exhaustive caller, deliberately.
- Wrapping and unwrapping are symmetric: whatever `buildDmGiftWraps` wraps, `unwrapGiftWrap` opens. Do not restore a kind allow-list here; the checks that matter are the layers' signatures and authors.
- A rumour without an `id` is refused, never given the one its fields produce.
- A disappearing message's seal carrying its `expiration`, as NIP-17 asks, opens. Do not widen the seal's allowed tags beyond `expiration`, and do not make disappearing messages a wrap-only expiry.
- innis/nostr-core's `GiftWrapper::unwrap` accepts the same seals, so the two libraries agree.
- Shared decision: nostr-adrs ADR-0073.
