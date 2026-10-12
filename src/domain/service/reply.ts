import { formatAddressableRef, parseAddressableRef } from "../value-object/addressable-ref.ts"
import { formatEventOrAddressRef } from "../value-object/event-or-address-ref.ts"
import {
  KIND_CHANNEL_MESSAGE,
  KIND_CHAT_MESSAGE,
  KIND_COMMENT,
  KIND_LIVE_CHAT_MESSAGE,
  KIND_TEXT_NOTE,
} from "../value-object/kinds.ts"
import type { Rumour, Tag, UnsignedEvent } from "../value-object/nostr-event.ts"
import type { PublicKey } from "../value-object/public-key.ts"
import { isValidPublicKey } from "../value-object/public-key.ts"
import type { RelayUrl } from "../value-object/relay-url.ts"
import { parseRelayUrl } from "../value-object/relay-url.ts"
import type { ExternalContentRef, ThreadRef } from "../value-object/thread-ref.ts"
import { withContentTags } from "./content-tags.ts"
import { parseWebUrl } from "../value-object/web-url.ts"
import { soleValue } from "../value-object/sole-tag-value.ts"
import { InvalidArgumentError } from "../exception/invalid-argument-error.ts"
import { eventTagAuthor, extractPubkeys, soleTagValue } from "./tags.ts"
import { now } from "./timestamp.ts"
import {
  analyseEvent,
  channelMessageThreadTags,
  replyTargetRef,
  shortNoteThreadTags,
  threadsAsComment,
} from "./event-analysis.ts"

const withHint = (tag: readonly [string, string], hint: string): Tag => hint === "" ? [...tag] : [...tag, hint]

const rootTagOf = (id: string, relay: string, pubkey: PublicKey | null): Tag =>
  pubkey === null ? ["e", id, relay, "root"] : ["e", id, relay, "root", pubkey]

const copiedRootTag = (source: Tag | null): Tag | null => {
  const id = source?.[1]
  return source === null || id === undefined
    ? null
    : rootTagOf(id, parseRelayUrl(source[2]) ?? "", eventTagAuthor(source))
}

const inheritedRootTag = (parent: Rumour): Tag | null => {
  const { root, parent: answered } = shortNoteThreadTags(parent.tags)
  const source = root ?? answered
  return source?.[1] === parent.id ? null : copiedRootTag(source)
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

const channelReplyTags = (parent: Rumour, hint: string): ReadonlyArray<Tag> => {
  const channel = copiedRootTag(channelMessageThreadTags(parent.tags).root)
  return [
    ...(channel === null ? [] : [channel]),
    ["e", parent.id, hint, "reply", parent.pubkey],
    withHint(["p", parent.pubkey], hint),
  ]
}

const coordinateText = (value: string): string | null => {
  const address = parseAddressableRef(value)
  return address === null ? null : formatAddressableRef(address)
}

// Deliberate: the activity is the parent's a tags as one claim, and the first tag stating it is carried as written — see shared ADR-0076
const liveActivityTags = (parent: Rumour): ReadonlyArray<Tag> => {
  const activity = soleTagValue(parent.tags, "a", coordinateText).value
  if (activity === null) return []
  const stating = parent.tags.find((tag) => tag[0] === "a" && coordinateText(tag[1] ?? "") === activity)
  return stating === undefined ? [] : [stating]
}

// Deliberate: a short note, chat, channel or live chat message is answered in its own kind — see shared ADR-0076
const ownKindReplyTags = (parent: Rumour, hint: string): ReadonlyArray<Tag> | null => {
  switch (parent.kind) {
    case KIND_TEXT_NOTE:
      return noteReplyTags(parent, hint)
    case KIND_CHAT_MESSAGE:
      return [["q", parent.id, hint, parent.pubkey]]
    case KIND_CHANNEL_MESSAGE:
      return channelReplyTags(parent, hint)
    case KIND_LIVE_CHAT_MESSAGE:
      return [...liveActivityTags(parent), ["e", parent.id, hint, parent.pubkey]]
    default:
      return null
  }
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
  const url = parseWebUrl(tag[2])
  return url === null ? ["I", tag[1] ?? ""] : ["I", tag[1] ?? "", url]
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
  const root = threadsAsComment(parent.kind) ? scopedRoot(parent) : null
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

// Deliberate: a hint cast past its WebUrl type is refused when the event is built — see shared ADR-0090
const externalHintOf = (content: ExternalContentRef): string => {
  if (content.hint === null) return ""
  const url = parseWebUrl(content.hint)
  if (url === null) {
    throw new InvalidArgumentError(`An external content hint is an http or https URL, not "${content.hint}"`)
  }
  return url
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

// Deliberate: one builder for every reply, the kind decided by the parent — see ADR-0043
/**
 * Build the reply to `parent`, choosing its kind from what it answers (shared ADR-0076). A kind 1 note, a kind 9 chat
 * message, a kind 42 channel message and a kind 1311 live chat message are answered in their own kind; anything else —
 * an article, a file, a comment, a voice message, external content — gets a NIP-22 kind 1111 comment, so a kind 1
 * reply to another kind cannot be built.
 *
 * - NIP-10: `["e", <id>, <relay>, "root" | "reply", <author>]` tags, the root's author read from the tag that names
 *   the root whether or not it is marked, and a `p` tag for the parent's author, every pubkey the parent's own `p` tags
 *   name, and the root's author.
 * - NIP-C7: a kind 9 quotes its parent, `["q", <id>, <relay>, <author>]`.
 * - NIP-28: a kind 42 is rooted at the parent's channel, its `root`-marked `e` tag, and names the parent in a
 *   `reply`-marked `e` tag and its author in a `p` tag.
 * - NIP-53: a kind 1311 carries the parent's live activity `a` tag, when its `a` tags agree on one, and names the
 *   parent in `["e", <id>, <relay>, <author>]`.
 * - NIP-22: the root scope in `A` / `E` / `I`, `K` and `P` (the parent itself, or the root scope of a parent comment or
 *   voice message comment; a parent comment naming no root and `K` is itself the root) and the parent in `a` and `e` /
 *   `e` / `i`, `k` and `p`. A copied `I` hint is written exactly as the parent wrote it, or dropped when it is not a
 *   `WebUrl`, and a copied scope without `P` gains one for the root's author when its `A` coordinate or `E` tag names
 *   it. External content needs a non-empty id and kind, and its own `hint`, when it has one, is written on `I` and `i`
 *   exactly as given; a hint that is not an `http` or `https` URL throws `InvalidArgumentError` (shared ADR-0090).
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
    return unsigned(KIND_COMMENT, externalScopeTags(parent, externalHintOf(parent)), content)
  }
  const ownKindTags = ownKindReplyTags(parent, where)
  if (ownKindTags !== null) return unsigned(parent.kind, ownKindTags, content)
  return unsigned(KIND_COMMENT, [...commentRootScope(parent, where), ...parentItemTags(parent, where)], content)
}
