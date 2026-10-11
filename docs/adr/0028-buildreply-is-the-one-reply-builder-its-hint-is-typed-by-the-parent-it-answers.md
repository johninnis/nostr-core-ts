# 0028. `buildReply` is the one reply builder, its hint is typed by the parent it answers, and an external content hint that is no web page is refused when the event is built

## Status

Accepted

## Context

Shared ADR-0076 decides the protocol: one way to build a reply, its kind chosen by the parent, its thread's root read from the parent and never taken as an input, its content tagged after its thread tags. A kind 1 note is answered by a kind 1 note (NIP-10), a kind 9 chat message by a kind 9 quoting it (NIP-C7), a kind 42 channel message by a kind 42 under the same channel (NIP-28), a kind 1311 live chat message by a kind 1311 in the same activity (NIP-53), and anything else by a kind 1111 comment (NIP-22). A parent that names no root is the root, which for a parent comment means one whose tags resolve no root scope, or state no `K` for it: NIP-22 says "Comments MUST point to the root scope using uppercase tag names" and "Tags `K` and `k` MUST be present", so copying a missing or partial scope would build a comment that breaks both.

What is left here is the TypeScript shape. A reply's hint means different things for its two kinds of parent: for an event, the relay where this caller saw it (`RelayUrl`, as every relay hint in this package is typed); for NIP-73 external content, the web page the content is shown at, which NIP-73 attaches to the content's id ("Each `i` tag MAY have a url hint as the second argument to redirect people to a website") and which a comment's reader keeps on the `ExternalContentRef` it reads (shared ADR-0090). A caller that holds a parent which may be either needs to call the builder without first splitting on the parent's type.

A type refuses only what is checked against it. A caller that casts a string to the hint's type, or hands over a ref read from JSON, gets past it, and shared ADR-0090 asks that a hint that is no web page be refused when the event is built.

## Decision

- `buildReply(content, parent, hint?)` is the only builder of a reply, over a `Rumour` or an `ExternalContentRef` parent; `buildTextNote(content, createdAt?)` builds only a note that answers nothing. The NIP-10, NIP-C7, NIP-28, NIP-53 and NIP-22 tag writers are private functions it dispatches to by the parent's kind.
- The hint's type follows the parent through `ReplyHint<P>`: a `RelayUrl` for a `Rumour`, and `never` for an `ExternalContentRef` or a parent typed as either. External content's web page is the ref's own `hint`, a `WebUrl`, the field `analyseEvent` reads it into, so a comment read back names the content it was built from, hint included, and a page is never given twice. A union caller therefore calls `buildReply` with no hint, and narrows the parent first to give one.
- An external content hint is put through `parseWebUrl` when the event is built and written exactly as given, its fragment included; a hint that is not an `http` or `https` URL throws `InvalidArgumentError`, whatever type it was cast to (shared ADR-0090).
- The content, the parent and the parent event's relay are three positional parameters. A parent event and its relay are not one value: the relay is where this caller saw the event, not a property of it. External content's web page is a property of it, and travels on the ref.
- A parent comment's or voice message comment's root scope (`A` / `E` / `I`, `K`, `P`) is copied only when `analyseEvent` resolves a root from it and it states one non-empty `K`; otherwise the parent is itself the root. A copied `I` hint is written exactly as the parent wrote it when `parseWebUrl` accepts it, or dropped, and a copied scope without a `P` gains one for the root's author from its `A` coordinate or `E` tags (shared ADR-0076, shared ADR-0090).
- A kind 1 reply names the root's author from the tag that names the root, by its length, whether or not the tag is marked (shared ADR-0012).

## Consequences

- A kind 1 reply to any other kind cannot be built through this package, and no caller writes the kind test.
- A chat, channel or live chat reply is threaded by the clients built for it, which a kind 1111 comment would not be. A group chat reply is the core reply with the group's `h` tag added (ADR-0040).
- A caller holding a `Rumour | ExternalContentRef` replies without casting, and cannot attach a hint meant for one kind of parent to the other.
- Do not reintroduce a comment-only or note-only reply builder, a flag that forces the kind, a root input, or overloads that refuse a union parent, and do not drop the build-time check on the hint for trusting its type.
- Shared decisions: nostr-adrs ADR-0012, ADR-0076, ADR-0081 and ADR-0090.
