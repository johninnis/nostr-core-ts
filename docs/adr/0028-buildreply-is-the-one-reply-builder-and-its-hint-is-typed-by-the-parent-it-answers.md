# 0028. `buildReply` is the one reply builder, and its hint is typed by the parent it answers

## Status

Accepted

## Context

Shared ADR-0076 decides the protocol: one way to build a reply, its kind chosen by the parent (a NIP-10 kind 1 note for a kind 1 parent, otherwise a NIP-22 kind 1111 comment), its thread's root read from the parent and never taken as an input, its content tagged after its thread tags. It also decides that a parent that names no root is the root, which for a parent comment means one whose tags resolve no root scope, or state no `K` for it: NIP-22 says "Comments MUST point to the root scope using uppercase tag names" and "Tags `K` and `k` MUST be present", so copying a missing or partial scope would build a comment that breaks both.

What is left here is the TypeScript shape. The package had two builders, `buildTextNote` with a reply context and `buildComment`, and every caller repeated `parent.kind === 1 ? note : comment`. A reply's hint means different things for its two kinds of parent: for an event, the relay where this caller saw it (`RelayUrl`, as every relay hint in this package is typed); for NIP-73 external content, the web page the content is shown at, which NIP-73 attaches to the content's id ("Each `i` tag MAY have a url hint as the second argument to redirect people to a website") and which a comment's reader keeps on the `ExternalContentRef` it reads (shared ADR-0090). A caller that holds a parent which may be either needs to call the builder without first splitting on the parent's type.

## Decision

- `buildReply(content, parent, hint?)` is the only builder of a reply, over a `Rumour` or an `ExternalContentRef` parent; `buildTextNote(content, createdAt?)` builds only a note that answers nothing, and `buildComment` is removed. The NIP-10 and NIP-22 tag writers are private functions it dispatches to by the parent.
- The hint's type follows the parent through `ReplyHint<P>`: a `RelayUrl` for a `Rumour`, and `never` for an `ExternalContentRef` or a parent typed as either. External content's web page is the ref's own `hint`, the field `analyseEvent` reads it into, so a comment read back names the content it was built from, hint included, and a page is never given twice. A union caller therefore calls `buildReply` with no hint, and narrows the parent first to give one. An external content hint that is not an `http` or `https` URL throws `InvalidArgumentError` (shared ADR-0090) and is written in the URL form of shared ADR-0081.
- The content, the parent and the parent event's relay are three positional parameters. A parent event and its relay are not one value: the relay is where this caller saw the event, not a property of it. External content's web page is a property of it, and travels on the ref.
- A parent comment's root scope (`A` / `E` / `I`, `K`, `P`) is copied only when `analyseEvent` resolves a root from it and it states one non-empty `K`; otherwise the parent comment is itself the root. A copied `I` hint is written through `parseHttpUrl` or dropped, and a copied scope without a `P` gains one for the root's author from its `A` coordinate or `E` tags (shared ADR-0076, shared ADR-0090).

## Consequences

- A kind 1 reply to any other kind cannot be built through this package, and no caller writes the kind test.
- A caller holding a `Rumour | ExternalContentRef` replies without casting, and cannot attach a hint meant for one kind of parent to the other.
- Do not reintroduce a comment-only or note-only reply builder, a flag that forces the kind, a root input, or overloads that refuse a union parent.
- Shared decisions: nostr-adrs ADR-0076, ADR-0081 and ADR-0090.
