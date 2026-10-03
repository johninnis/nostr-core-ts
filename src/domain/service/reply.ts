import { formatEventOrAddressRef } from "../value-object/event-or-address-ref.ts"
import { KIND_COMMENT, KIND_TEXT_NOTE } from "../value-object/kinds.ts"
import type { Rumour, Tag, UnsignedEvent } from "../value-object/nostr-event.ts"
import type { PublicKey } from "../value-object/public-key.ts"
import { isValidPublicKey } from "../value-object/public-key.ts"
import type { RelayUrl } from "../value-object/relay-url.ts"
import { parseRelayUrl } from "../value-object/relay-url.ts"
import type { ExternalContentRef, ThreadRef } from "../value-object/thread-ref.ts"
import { withContentTags } from "./content-tags.ts"
import { parseHttpUrl } from "../value-object/http-url.ts"
import { soleValue } from "../value-object/sole-tag-value.ts"
import { InvalidArgumentError } from "../exception/invalid-argument-error.ts"
import { eventTagAuthor, extractPubkeys, nip10Marker, soleTagValue } from "./tags.ts"
import { now } from "./timestamp.ts"
import { analyseEvent, replyTargetRef, shortNoteThreadTags } from "./event-analysis.ts"

const withHint = (tag: readonly [string, string], hint: string): Tag => hint === "" ? [...tag] : [...tag, hint]

const markedPubkey = (tag: Tag): PublicKey | null => nip10Marker(tag) === null ? null : eventTagAuthor(tag)

const rootTagOf = (id: string, relay: string, pubkey: PublicKey | null): Tag =>
  pubkey === null ? ["e", id, relay, "root"] : ["e", id, relay, "root", pubkey]

const inheritedRootTag = (parent: Rumour): Tag | null => {
  const { root, parent: answered } = shortNoteThreadTags(parent.tags)
  const source = root ?? answered
  const id = source?.[1]
  if (source === null || id === undefined || id === parent.id) return null
  const relay = source[2] === undefined ? null : parseRelayUrl(source[2])
  return rootTagOf(id, relay ?? "", markedPubkey(source))
}

const noteReplyTags = (parent: Rumour, hint: string): ReadonlyArray<Tag> => {
  const rootTag = inheritedRootTag(parent)
  const eTags: ReadonlyArray<Tag> = rootTag === null
    ? [["e", parent.id, hint, "root", parent.pubkey]]
    : [rootTag, ["e", parent.id, hint, "reply", parent.pubkey]]
  const rootAuthor = rootTag?.[4]
  const participants = new Set([
    parent.pubkey,
    ...extractPubkeys(parent.tags),
    ...(rootAuthor === undefined ? [] : [rootAuthor]),
  ])
  return [...eTags, ...[...participants].map((pubkey): Tag => ["p", pubkey])]
}

const ROOT_SCOPE_TAG_NAMES: ReadonlySet<string> = new Set(["A", "E", "I", "K", "P"])

const eventScopeTags = (event: Rumour, hint: string): ReadonlyArray<Tag> => {
  const ref = replyTargetRef(event)
  const scope: Tag = ref.type === "address"
    ? ["A", formatEventOrAddressRef(ref), hint]
    : ["E", event.id, hint, event.pubkey]
  return [scope, ["K", String(event.kind)], withHint(["P", event.pubkey], hint)]
}

const scopedRoot = (comment: Rumour): ThreadRef | null => {
  const rootKind = soleTagValue(comment.tags, "K").value
  return rootKind === null || rootKind === "" ? null : analyseEvent(comment).refs.rootEvent
}

const copiedScopeTag = (tag: Tag): Tag => {
  if (tag[0] !== "I") return tag
  const page = tag[2] === undefined ? null : parseHttpUrl(tag[2])
  return page === null ? ["I", tag[1] ?? ""] : ["I", tag[1] ?? "", page]
}

const rootEventAuthor = (comment: Rumour, rootId: string): PublicKey | null =>
  soleValue(
    comment.tags.filter((tag) => tag[0] === "E" && tag[1] === rootId).map((tag) => tag[3]).filter(isValidPublicKey),
  ).value

const knownRootAuthor = (comment: Rumour, root: ThreadRef): PublicKey | null => {
  if (root.type === "address") return root.address.pubkey
  return root.type === "event" ? rootEventAuthor(comment, root.id) : null
}

const copiedRootScope = (parent: Rumour, root: ThreadRef): ReadonlyArray<Tag> => {
  const scope = parent.tags.filter((tag) => ROOT_SCOPE_TAG_NAMES.has(tag[0])).map(copiedScopeTag)
  const author = scope.some((tag) => tag[0] === "P" && isValidPublicKey(tag[1])) ? null : knownRootAuthor(parent, root)
  return author === null ? scope : [...scope, ["P", author]]
}

const commentRootScope = (parent: Rumour, hint: string): ReadonlyArray<Tag> => {
  const root = parent.kind === KIND_COMMENT ? scopedRoot(parent) : null
  return root === null ? eventScopeTags(parent, hint) : copiedRootScope(parent, root)
}

const parentItemTags = (parent: Rumour, hint: string): ReadonlyArray<Tag> => {
  const ref = replyTargetRef(parent)
  const eventTag: Tag = ["e", parent.id, hint, parent.pubkey]
  const pointers: ReadonlyArray<Tag> = ref.type === "address"
    ? [["a", formatEventOrAddressRef(ref), hint], eventTag]
    : [eventTag]
  return [...pointers, ["k", String(parent.kind)], withHint(["p", parent.pubkey], hint)]
}

const requireExternalContent = (content: ExternalContentRef): void => {
  if (content.id === "" || content.kind === "") {
    throw new InvalidArgumentError(
      `External content is named by a non-empty id and kind, not id "${content.id}" and kind "${content.kind}"`,
    )
  }
}

const externalScopeTags = (content: ExternalContentRef, hint: string): ReadonlyArray<Tag> => [
  withHint(["I", content.id], hint),
  ["K", content.kind],
  withHint(["i", content.id], hint),
  ["k", content.kind],
]

const isExternalContent = (parent: Rumour | ExternalContentRef): parent is ExternalContentRef =>
  "type" in parent && parent.type === "external"

const unsigned = (kind: number, tags: ReadonlyArray<Tag>, content: string): UnsignedEvent => ({
  kind,
  created_at: now(),
  tags: withContentTags(tags, content),
  content,
})

/**
 * Where a reply's parent event can be found: a `RelayUrl` for an event, and nothing for external content, which carries
 * its own web page as its `hint`, or for a parent that may be either; a caller holding such a parent narrows it before
 * giving a hint.
 */
export type ReplyHint<P extends Rumour | ExternalContentRef> = [P] extends [Rumour] ? RelayUrl : never

// Deliberate: one builder for NIP-10 and NIP-22 replies, the kind decided by the parent — see ADR-0028
/**
 * Build the reply to `parent`, choosing its kind from what it answers. A reply to a kind 1 note gets a NIP-10 kind 1
 * note; anything else — an article, a file, a comment, external content — gets a NIP-22 kind 1111 comment, so a kind 1
 * reply to another kind cannot be built.
 *
 * - NIP-10: `["e", <id>, <relay>, "root" | "reply", <author>]` tags, and a `p` tag for the parent's author, every
 *   pubkey the parent's own `p` tags name, and the root's author.
 * - NIP-22: the root scope in `A` / `E` / `I`, `K` and `P` (the parent itself, or a parent comment's own root scope; a
 *   parent comment naming no root and `K` is itself the root) and the parent in `a` and `e` / `e` / `i`, `k` and `p`. A
 *   copied `I` hint is written in its web page form or dropped, and a copied scope without `P` gains one for the root's
 *   author when its `A` coordinate or `E` tag names it. External content needs a non-empty id and kind, and its own
 *   `hint`, when it has one, is written on `I` and `i` (shared ADR-0090).
 *
 * The thread's root is read from the parent's own tags. `hint` is the relay where a parent event can be found
 * ({@link ReplyHint}). The content is then tagged as `buildTextNote` tags it: nostr: references become `p` / `q` tags
 * and hashtags `t` tags, and a content tag with the name and value of a thread tag is left out, so the thread tag is
 * kept.
 */
export const buildReply = <P extends Rumour | ExternalContentRef>(
  content: string,
  parent: P,
  hint: ReplyHint<P> | null = null,
): UnsignedEvent => {
  const where: string = hint ?? ""
  if (isExternalContent(parent)) {
    requireExternalContent(parent)
    return unsigned(KIND_COMMENT, externalScopeTags(parent, parent.hint ?? ""), content)
  }
  if (parent.kind === KIND_TEXT_NOTE) return unsigned(KIND_TEXT_NOTE, noteReplyTags(parent, where), content)
  return unsigned(KIND_COMMENT, [...commentRootScope(parent, where), ...parentItemTags(parent, where)], content)
}
