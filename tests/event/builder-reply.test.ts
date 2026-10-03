import { assertEquals, assertThrows } from "@std/assert"
import { InvalidArgumentError } from "../../src/domain/exception/invalid-argument-error.ts"
import { buildReply } from "../../src/domain/service/reply.ts"
import { encodeNaddr, encodePubkeyToNpub } from "../../src/domain/service/bech32.ts"
import { analyseEvent, replyTargetRef } from "../../src/domain/service/event-analysis.ts"
import { KIND_COMMENT, KIND_LONGFORM_CONTENT, KIND_TEXT_NOTE } from "../../src/domain/value-object/kinds.ts"
import type { Rumour } from "../../src/domain/value-object/nostr-event.ts"
import type { ExternalContentRef } from "../../src/domain/value-object/thread-ref.ts"
import { eventIdFixture, httpUrlFixture, publicKeyFixture, relayUrlFixture } from "../../testing.ts"

const a1 = publicKeyFixture("a1".repeat(32))
const p1 = publicKeyFixture("01".repeat(32))
const p2 = publicKeyFixture("02".repeat(32))
const p3 = publicKeyFixture("03".repeat(32))
const rootId = eventIdFixture("c".repeat(64))
const parentId = eventIdFixture("d".repeat(64))
const RELAY = relayUrlFixture("wss://relay.example.com")

const event = (overrides: Partial<Rumour> & { kind: number }): Rumour => ({
  id: parentId,
  pubkey: a1,
  created_at: 1700000000,
  content: "",
  tags: [],
  ...overrides,
})

const rootNote = event({ kind: KIND_TEXT_NOTE, id: rootId, pubkey: p1 })

Deno.test("buildReply - a reply to a kind 1 note is a kind 1 note", () => {
  assertEquals(buildReply("gm", rootNote).kind, KIND_TEXT_NOTE)
})

Deno.test("buildReply - a direct reply to a root note has one root-marked e tag with its relay and author (NIP-10)", () => {
  const reply = buildReply("gm", rootNote, RELAY)
  assertEquals(reply.tags.filter((t) => t[0] === "e"), [["e", rootId, RELAY, "root", p1]])
})

Deno.test("buildReply - an event's hint is a RelayUrl, not any string", () => {
  // @ts-expect-error: where an event can be found is a relay, so a plain string is refused
  assertEquals(buildReply("gm", rootNote, "wss://relay.example.com").kind, KIND_TEXT_NOTE)
})

Deno.test("buildReply - a parent that may be an event or external content is answered by its own kind", () => {
  const parents: ReadonlyArray<Rumour | ExternalContentRef> = [rootNote, {
    type: "external",
    id: "#nostr",
    kind: "#",
    hint: null,
  }]
  assertEquals(parents.map((parent) => buildReply("gm", parent).kind), [KIND_TEXT_NOTE, KIND_COMMENT])
})

Deno.test("buildReply - a parent that may be an event or external content takes no hint, since none is both", () => {
  const parents: ReadonlyArray<Rumour | ExternalContentRef> = [rootNote]
  // @ts-expect-error: a relay URL is no web page, and a web page is no relay
  assertEquals(parents.map((parent) => buildReply("gm", parent, RELAY).kind), [KIND_TEXT_NOTE])
})

Deno.test("buildReply - p tags hold the parent's author and every p tag it carries (NIP-10 example)", () => {
  const parent = event({ kind: KIND_TEXT_NOTE, pubkey: a1, tags: [["p", p1], ["p", p2], ["p", p3]] })
  const reply = buildReply("reply", parent)
  assertEquals(reply.tags.filter((t) => t[0] === "p").map((t) => t[1]).toSorted(), [a1, p1, p2, p3].toSorted())
})

Deno.test("buildReply - a pubkey the parent tags more than once is tagged once", () => {
  const parent = event({ kind: KIND_TEXT_NOTE, pubkey: a1, tags: [["p", p1], ["p", p1], ["p", a1]] })
  assertEquals(buildReply("reply", parent).tags.filter((t) => t[0] === "p"), [["p", a1], ["p", p1]])
})

Deno.test("buildReply - a malformed p tag on the parent is not copied", () => {
  const parent = event({ kind: KIND_TEXT_NOTE, pubkey: a1, tags: [["p", "not-a-pubkey"]] })
  assertEquals(buildReply("reply", parent).tags.filter((t) => t[0] === "p"), [["p", a1]])
})

Deno.test("buildReply - a reply to a reply keeps the parent's marked root and marks the parent reply", () => {
  const parent = event({ kind: KIND_TEXT_NOTE, tags: [["e", rootId, "wss://root.example", "root", p1], ["p", p1]] })
  const reply = buildReply("deeper", parent, RELAY)
  assertEquals(reply.tags.filter((t) => t[0] === "e"), [
    ["e", rootId, "wss://root.example", "root", p1],
    ["e", parentId, RELAY, "reply", a1],
  ])
})

Deno.test("buildReply - the root's relay read from the parent is written in its canonical form", () => {
  const parent = event({ kind: KIND_TEXT_NOTE, tags: [["e", rootId, "WSS://Root.Example:443/", "root", p1]] })
  assertEquals(buildReply("deeper", parent).tags[0], ["e", rootId, "wss://root.example", "root", p1])
})

Deno.test("buildReply - a root relay on the parent that is not a relay URL is left out", () => {
  const parent = event({ kind: KIND_TEXT_NOTE, tags: [["e", rootId, "not a relay", "root", p1]] })
  assertEquals(buildReply("deeper", parent).tags[0], ["e", rootId, "", "root", p1])
})

Deno.test("buildReply - the root's relay and author come from the parent's root-marked tag, not a mention of it", () => {
  const parent = event({
    kind: KIND_TEXT_NOTE,
    tags: [["e", rootId, "wss://mention.example", "mention", p2], ["e", rootId, "wss://root.example", "root", p1]],
  })
  assertEquals(buildReply("deeper", parent).tags[0], ["e", rootId, "wss://root.example", "root", p1])
})

Deno.test("buildReply - a parent whose root markers disagree is answered under its reply-marked tag, with that tag's author (shared ADR-0076)", () => {
  const parent = event({
    kind: KIND_TEXT_NOTE,
    tags: [["e", rootId, "", "root"], ["e", eventIdFixture("e".repeat(64)), "", "root"], [
      "e",
      rootId,
      "",
      "reply",
      p1,
    ]],
  })
  const reply = buildReply("deeper", parent)
  assertEquals(reply.tags.filter((t) => t[0] === "e" || t[0] === "p"), [
    ["e", rootId, "", "root", p1],
    ["e", parentId, "", "reply", a1],
    ["p", a1],
    ["p", p1],
  ])
})

Deno.test("buildReply - the root read from a parent's deprecated positional e tag has no author slot", () => {
  const parent = event({ kind: KIND_TEXT_NOTE, tags: [["e", rootId]] })
  assertEquals(buildReply("deeper", parent).tags.filter((t) => t[0] === "e"), [
    ["e", rootId, "", "root"],
    ["e", parentId, "", "reply", a1],
  ])
})

Deno.test("buildReply - a kind 1 reply reads back as a reply to its parent under its root", () => {
  const parent = event({ kind: KIND_TEXT_NOTE, tags: [["e", rootId, "", "root", p1]] })
  const refs = analyseEvent({ ...buildReply("x", parent), id: eventIdFixture("e".repeat(64)), pubkey: p2 }).refs
  assertEquals([refs.rootEvent, refs.replyToEvent], [{ type: "event", id: rootId }, { type: "event", id: parentId }])
})

Deno.test("buildReply - content references and hashtags are tagged after the thread tags", () => {
  const cited = encodeNaddr({ kind: KIND_LONGFORM_CONTENT, pubkey: p2, dTag: "cited" }) ?? ""
  const reply = buildReply(`#Nostr nostr:${cited}`, rootNote)
  assertEquals(reply.tags.slice(-3), [["p", p2], ["q", `${KIND_LONGFORM_CONTENT}:${p2}:cited`], ["t", "nostr"]])
})

Deno.test("buildReply - a thread p tag the content repeats stays where the thread wrote it (shared vector with innis/nostr-core)", () => {
  const author = publicKeyFixture("11".repeat(32))
  const other = publicKeyFixture("22".repeat(32))
  const parent = event({
    kind: KIND_TEXT_NOTE,
    id: eventIdFixture("44".repeat(32)),
    pubkey: author,
    tags: [["p", other]],
  })
  const reply = buildReply("nostr:npub1zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zygse4sl3h #nostr", parent)
  assertEquals(reply.tags, [
    ["e", "44".repeat(32), "", "root", author],
    ["p", author],
    ["p", other],
    ["t", "nostr"],
  ])
})

Deno.test("buildReply - a comment mentioning its parent's author keeps the relay on the parent p tag (shared vector with innis/nostr-core)", () => {
  const alice = publicKeyFixture("79be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798")
  const bob = publicKeyFixture("c6047f9441ed7d6d3045406e95c07cd85c778e4b8cef3ca7abac09b95c709ee5")
  const articleId = "ad7045d96edf815d23fb2922cbdb0c12bf266815c2a3045c4179565c669e6b9d"
  const article = event({
    kind: KIND_LONGFORM_CONTENT,
    id: eventIdFixture(articleId),
    pubkey: alice,
    tags: [["d", "post"]],
  })
  const coordinate = `${KIND_LONGFORM_CONTENT}:${alice}:post`
  const reply = buildReply(`nostr:${encodePubkeyToNpub(alice)} nostr:${encodePubkeyToNpub(bob)} #nostr`, article, RELAY)
  assertEquals(reply.tags, [
    ["A", coordinate, RELAY],
    ["K", "30023"],
    ["P", alice, RELAY],
    ["a", coordinate, RELAY],
    ["e", articleId, RELAY, alice],
    ["k", "30023"],
    ["p", alice, RELAY],
    ["p", bob],
    ["t", "nostr"],
  ])
})

const blogAuthor = publicKeyFixture("3c9849383bdea883b0bd16fece1ed36d37e37cdde3ce43b17ea4e9192ec11289")
const blogId = eventIdFixture("5b4fc7fed15672fefe65d2426f67197b71ccc82aa0cc8a9e94f683eb78e07651")
const blogCoordinate = "30023:3c9849383bdea883b0bd16fece1ed36d37e37cdde3ce43b17ea4e9192ec11289:f9347ca7"
const blogPost = event({ kind: KIND_LONGFORM_CONTENT, id: blogId, pubkey: blogAuthor, tags: [["d", "f9347ca7"]] })
const EXAMPLE_RELAY = relayUrlFixture("wss://example.relay")

Deno.test("buildReply - a reply to a kind 30023 article is a kind 1111 comment (NIP-23 MUST)", () => {
  assertEquals(buildReply("Great blog post!", blogPost).kind, KIND_COMMENT)
})

Deno.test("buildReply - a comment on a blog post carries the NIP-22 example's tags, the e tag naming its author", () => {
  assertEquals(buildReply("Great blog post!", blogPost, EXAMPLE_RELAY).tags, [
    ["A", blogCoordinate, EXAMPLE_RELAY],
    ["K", "30023"],
    ["P", blogAuthor, EXAMPLE_RELAY],
    ["a", blogCoordinate, EXAMPLE_RELAY],
    ["e", blogId, EXAMPLE_RELAY, blogAuthor],
    ["k", "30023"],
    ["p", blogAuthor, EXAMPLE_RELAY],
  ])
})

Deno.test("buildReply - a comment on a replaceable event scopes to and names its coordinate and its id (NIP-22)", () => {
  const relayList = event({ kind: 10002, id: blogId, pubkey: blogAuthor })
  const coordinate = `10002:${blogAuthor}:`
  assertEquals(buildReply("Nice relays", relayList).tags, [
    ["A", coordinate, ""],
    ["K", "10002"],
    ["P", blogAuthor],
    ["a", coordinate, ""],
    ["e", blogId, "", blogAuthor],
    ["k", "10002"],
    ["p", blogAuthor],
  ])
})

const fileAuthor = publicKeyFixture("3721e07b079525289877c366ccab47112bdff3d1b44758ca333feb2dbbbbe5bb")
const fileId = eventIdFixture("768ac8720cdeb59227cf95e98b66560ef03d8bc9a90d721779e76e68fb42f5e6")
const file = event({ kind: 1063, id: fileId, pubkey: fileAuthor })

Deno.test("buildReply - a comment on a NIP-94 file scopes to and names its id (NIP-22 example)", () => {
  assertEquals(buildReply("Great file!", file).tags, [
    ["E", fileId, "", fileAuthor],
    ["K", "1063"],
    ["P", fileAuthor],
    ["e", fileId, "", fileAuthor],
    ["k", "1063"],
    ["p", fileAuthor],
  ])
})

Deno.test("buildReply - a reply to a comment keeps its root scope and names the comment (NIP-22 example)", () => {
  const commenter = publicKeyFixture("93ef2ebaaf9554661f33e79949007900bbc535d239a4c801c33a4d67d3e7f546")
  const scopeAuthor = publicKeyFixture("fd913cd6fa9edb8405750cd02a8bbe16e158b8676c0e69fdc27436cc4a54cc9a")
  const commentId = eventIdFixture("5c83da77af1dec6d7289834998ad7aafbd9e2191396d75ec3cc27f5a77226f36")
  const comment = event({
    kind: KIND_COMMENT,
    id: commentId,
    pubkey: commenter,
    tags: [
      ["E", fileId, EXAMPLE_RELAY, scopeAuthor],
      ["K", "1063"],
      ["P", scopeAuthor],
      ["e", fileId, EXAMPLE_RELAY, scopeAuthor],
      ["k", "1063"],
      ["p", scopeAuthor],
    ],
  })
  assertEquals(buildReply('This is a reply to "Great file!"', comment, EXAMPLE_RELAY).tags, [
    ["E", fileId, EXAMPLE_RELAY, scopeAuthor],
    ["K", "1063"],
    ["P", scopeAuthor],
    ["e", commentId, EXAMPLE_RELAY, commenter],
    ["k", "1111"],
    ["p", commenter, EXAMPLE_RELAY],
  ])
})

Deno.test("buildReply - a reply to a comment that names no root scope takes the comment as its root (NIP-22 MUST)", () => {
  const orphan = event({ kind: KIND_COMMENT, tags: [["e", rootId], ["k", "1"], ["p", p1]] })
  assertEquals(buildReply("x", orphan, RELAY).tags, [
    ["E", parentId, RELAY, a1],
    ["K", "1111"],
    ["P", a1, RELAY],
    ["e", parentId, RELAY, a1],
    ["k", "1111"],
    ["p", a1, RELAY],
  ])
})

Deno.test("buildReply - a reply to a comment whose root scope states no K takes the comment as its root (NIP-22 MUST)", () => {
  const unkinded = event({ kind: KIND_COMMENT, tags: [["E", rootId], ["e", rootId], ["k", "1"]] })
  assertEquals(buildReply("x", unkinded).tags.filter((t) => t[0] === "E" || t[0] === "K"), [
    ["E", parentId, "", a1],
    ["K", "1111"],
  ])
})

Deno.test("buildReply - a reply to a comment whose E tags disagree takes the comment as its root (shared ADR-0014)", () => {
  const split = event({ kind: KIND_COMMENT, tags: [["E", rootId], ["E", p3], ["K", "1"]] })
  assertEquals(buildReply("x", split).tags.filter((t) => t[0] === "E"), [["E", parentId, "", a1]])
})

Deno.test("buildReply - a comment on an article reads back with the article as root and parent", () => {
  const refs = analyseEvent({ ...buildReply("Amen", blogPost), id: parentId, pubkey: p2 }).refs
  assertEquals([refs.isReply, refs.rootEvent, refs.replyToEvent], [
    true,
    replyTargetRef(blogPost),
    replyTargetRef(blogPost),
  ])
})

const PODCAST_EPISODE = "podcast:item:guid:d98d189b-dc7b-45b1-8720-d4b98690f31f"
const EPISODE_PAGE = httpUrlFixture("https://fountain.fm/episode/z1y9TMQRuqXl2awyrQxg")

Deno.test("buildReply - a comment on a website's url scopes to and names it with I / i and K / k (NIP-22 example)", () => {
  const url = "https://abc.com/articles/1"
  const comment = buildReply("Nice article!", { type: "external", id: url, kind: "web", hint: null })
  assertEquals([comment.kind, comment.tags], [KIND_COMMENT, [["I", url], ["K", "web"], ["i", url], ["k", "web"]]])
})

Deno.test("buildReply - external content's hint is the web page on I and i (NIP-22 podcast example)", () => {
  const episode = { type: "external", id: PODCAST_EPISODE, kind: "podcast:item:guid", hint: EPISODE_PAGE } as const
  assertEquals(buildReply("This was a great episode!", episode).tags, [
    ["I", PODCAST_EPISODE, EPISODE_PAGE],
    ["K", "podcast:item:guid"],
    ["i", PODCAST_EPISODE, EPISODE_PAGE],
    ["k", "podcast:item:guid"],
  ])
})

Deno.test("buildReply - external content takes its web page from its own hint, not from a hint argument", () => {
  const episode = { type: "external", id: PODCAST_EPISODE, kind: "podcast:item:guid", hint: null } as const
  // @ts-expect-error: external content carries its web page as its hint; the argument is for an event's relay
  assertEquals(buildReply("x", episode, EPISODE_PAGE).kind, KIND_COMMENT)
})

Deno.test("buildReply - a reply to a podcast comment keeps I and K and names the comment (NIP-22 example)", () => {
  const commenter = publicKeyFixture("252f10c83610ebca1a059c0bae8255eba2f95be4d1d7bcfa89d7248a82d9f111")
  const commentId = eventIdFixture("80c48d992a38f9c445b943a9c9f1010b396676013443765750431a9004bdac05")
  const comment = event({
    kind: KIND_COMMENT,
    id: commentId,
    pubkey: commenter,
    tags: [
      ["I", PODCAST_EPISODE, EPISODE_PAGE],
      ["K", "podcast:item:guid"],
      ["i", PODCAST_EPISODE, EPISODE_PAGE],
      ["k", "podcast:item:guid"],
    ],
  })
  assertEquals(buildReply("I'm replying to the above comment.", comment, EXAMPLE_RELAY).tags, [
    ["I", PODCAST_EPISODE, EPISODE_PAGE],
    ["K", "podcast:item:guid"],
    ["e", commentId, EXAMPLE_RELAY, commenter],
    ["k", "1111"],
    ["p", commenter, EXAMPLE_RELAY],
  ])
})

Deno.test("buildReply - a comment on external content reads back with it, and its hint, as root and parent", () => {
  const episode = { type: "external", id: PODCAST_EPISODE, kind: "podcast:item:guid", hint: EPISODE_PAGE } as const
  const refs = analyseEvent({ ...buildReply("Great", episode), id: parentId, pubkey: p2 }).refs
  assertEquals([refs.isReply, refs.rootEvent, refs.replyToEvent], [true, episode, episode])
})

Deno.test("buildReply - throws for external content with an empty id (NIP-22 I / i MUST carry the I-value)", () => {
  assertThrows(() => buildReply("x", { type: "external", id: "", kind: "web", hint: null }), InvalidArgumentError)
})

Deno.test('buildReply - throws for external content with an empty kind (NIP-22 "Tags K and k MUST be present")', () => {
  assertThrows(
    () => buildReply("x", { type: "external", id: "https://abc.com/a", kind: "", hint: null }),
    InvalidArgumentError,
  )
})

const externalComment = (hint: string): Rumour =>
  event({
    kind: KIND_COMMENT,
    tags: [["I", PODCAST_EPISODE, hint], ["K", "podcast:item:guid"], ["i", PODCAST_EPISODE], [
      "k",
      "podcast:item:guid",
    ]],
  })

Deno.test("buildReply - a copied root scope writes an I hint in its web page form (shared ADR-0090)", () => {
  const tags = buildReply("x", externalComment("HTTPS://Fountain.FM:443/episode/1#top")).tags
  assertEquals(tags.filter((t) => t[0] === "I"), [["I", PODCAST_EPISODE, "https://fountain.fm/episode/1"]])
})

Deno.test("buildReply - a copied root scope drops an I hint that is no web page (shared ADR-0090)", () => {
  const tags = buildReply("x", externalComment("javascript:alert(1)")).tags
  assertEquals(tags.filter((t) => t[0] === "I"), [["I", PODCAST_EPISODE]])
})

Deno.test("buildReply - a reply to a comment without P names the root author from its A coordinate (NIP-22 MUST)", () => {
  const comment = event({
    kind: KIND_COMMENT,
    pubkey: p2,
    tags: [["A", blogCoordinate], ["K", "30023"], ["a", blogCoordinate], ["k", "30023"]],
  })
  assertEquals(buildReply("x", comment).tags.filter((t) => t[0] === "P"), [["P", blogAuthor]])
})

Deno.test("buildReply - a reply to a comment without P names the root author from its E tag (NIP-22 MUST)", () => {
  const comment = event({
    kind: KIND_COMMENT,
    pubkey: p2,
    tags: [["E", fileId, "", fileAuthor], ["K", "1063"], ["e", fileId, "", fileAuthor], ["k", "1063"]],
  })
  assertEquals(buildReply("x", comment).tags.filter((t) => t[0] === "P"), [["P", fileAuthor]])
})

Deno.test("buildReply - a reply to a comment keeps the parent's P rather than deriving another", () => {
  const comment = event({
    kind: KIND_COMMENT,
    pubkey: p2,
    tags: [["A", blogCoordinate], ["K", "30023"], ["P", p3], ["a", blogCoordinate], ["k", "30023"]],
  })
  assertEquals(buildReply("x", comment).tags.filter((t) => t[0] === "P"), [["P", p3]])
})

Deno.test("buildReply - a reply to a comment on external content without P writes no P, as no author is known", () => {
  assertEquals(buildReply("x", externalComment("")).tags.filter((t) => t[0] === "P"), [])
})
