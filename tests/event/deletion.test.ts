import { assertEquals } from "@std/assert"
import { buildDeletionLookupFilters, deletedCoordinates, deletionCovers } from "../../src/domain/service/deletion.ts"
import { compileFilters } from "../../src/domain/service/filter.ts"
import { parseNostrEvent } from "../../src/domain/service/event-utils.ts"
import type { NostrEvent } from "../../src/domain/value-object/nostr-event.ts"
import { buildEventFixture, publicKeyFixture } from "../../testing.ts"

interface DeletionCase {
  readonly description: string
  readonly deletion: NostrEvent
  readonly target: NostrEvent
  readonly covers: boolean
}

interface DeletionVectors {
  readonly cases: ReadonlyArray<{
    readonly description: string
    readonly deletion: unknown
    readonly target: unknown
    readonly covers: boolean
  }>
}

const VECTORS: DeletionVectors = JSON.parse(
  await Deno.readTextFile(new URL("./deletion-vectors.json", import.meta.url)),
)

const cases: ReadonlyArray<DeletionCase> = VECTORS.cases.flatMap(({ description, deletion, target, covers }) => {
  const parsedDeletion = parseNostrEvent(deletion)
  const parsedTarget = parseNostrEvent(target)
  return parsedDeletion === null || parsedTarget === null
    ? []
    : [{ description, deletion: parsedDeletion, target: parsedTarget, covers }]
})

Deno.test("deletionCovers - the shared corpus is fully loaded", () => {
  assertEquals(cases.length, 28)
})

Deno.test("deletionCovers - judges every shared case as the corpus does", () => {
  const disagreements = cases
    .filter(({ deletion, target, covers }) => deletionCovers(deletion, target) !== covers)
    .map(({ description }) => description)
  assertEquals(disagreements, [])
})

Deno.test("buildDeletionLookupFilters - finds the request in every shared case where it covers its target", () => {
  const missed = cases
    .filter(({ deletion, target, covers }) =>
      covers && !compileFilters(buildDeletionLookupFilters(target)).matches(deletion)
    )
    .map(({ description }) => description)
  assertEquals(missed, [])
})

const AUTHOR = publicKeyFixture("a".repeat(64))
const OTHER = publicKeyFixture("b".repeat(64))
const T = 1_700_000_000

Deno.test("buildDeletionLookupFilters - a regular event is looked up by its id under its author", () => {
  const note = buildEventFixture({ pubkey: AUTHOR, kind: 1 })
  assertEquals(buildDeletionLookupFilters(note), [{ kinds: [5], authors: [note.pubkey], "#e": [note.id] }])
})

Deno.test("buildDeletionLookupFilters - a replaceable version is also looked up by its coordinate, from its created_at", () => {
  const pins = buildEventFixture({ pubkey: AUTHOR, kind: 10001, created_at: T })
  assertEquals(buildDeletionLookupFilters(pins), [
    { kinds: [5], authors: [pins.pubkey], "#e": [pins.id] },
    { kinds: [5], authors: [pins.pubkey], "#a": [`10001:${AUTHOR}:`], since: T },
  ])
})

Deno.test("buildDeletionLookupFilters - an addressable version is looked up by its coordinate's identifier", () => {
  const article = buildEventFixture({ pubkey: AUTHOR, kind: 30023, created_at: T, tags: [["d", "article"]] })
  assertEquals(buildDeletionLookupFilters(article)[1], {
    kinds: [5],
    authors: [article.pubkey],
    "#a": [`30023:${AUTHOR}:article`],
    since: T,
  })
})

Deno.test("buildDeletionLookupFilters - an addressable event whose d tags disagree has no coordinate and is looked up by its id alone", () => {
  const article = buildEventFixture({ pubkey: AUTHOR, kind: 30023, tags: [["d", "article"], ["d", "draft"]] })
  assertEquals(buildDeletionLookupFilters(article), [{ kinds: [5], authors: [article.pubkey], "#e": [article.id] }])
})

Deno.test("buildDeletionLookupFilters - a gift wrap is also looked up under each key it is addressed to", () => {
  const wrap = buildEventFixture({ pubkey: AUTHOR, kind: 1059, tags: [["p", OTHER], ["p", "not a key"]] })
  assertEquals(buildDeletionLookupFilters(wrap), [{ kinds: [5], authors: [AUTHOR, OTHER], "#e": [wrap.id] }])
})

Deno.test("buildDeletionLookupFilters - a gift wrap addressed to its own signer names that key once", () => {
  const wrap = buildEventFixture({ pubkey: AUTHOR, kind: 1059, tags: [["p", AUTHOR]] })
  assertEquals(buildDeletionLookupFilters(wrap)[0]?.authors, [AUTHOR])
})

Deno.test("buildDeletionLookupFilters - a deletion request is never looked up, since nothing deletes it", () => {
  assertEquals(buildDeletionLookupFilters(buildEventFixture({ pubkey: AUTHOR, kind: 5 })), [])
})

Deno.test("deletedCoordinates - the coordinates of the request's author's own events, replaceable ones included", () => {
  const deletion = buildEventFixture({
    pubkey: AUTHOR,
    kind: 5,
    tags: [["a", `30023:${AUTHOR}:article`], ["a", `10001:${AUTHOR}:`]],
  })
  assertEquals(deletedCoordinates(deletion), [
    { kind: 30023, pubkey: AUTHOR, dTag: "article" },
    { kind: 10001, pubkey: AUTHOR, dTag: "" },
  ])
})

Deno.test("deletedCoordinates - a coordinate naming another author is ignored", () => {
  const deletion = buildEventFixture({ pubkey: AUTHOR, kind: 5, tags: [["a", `30023:${OTHER}:article`]] })
  assertEquals(deletedCoordinates(deletion), [])
})

Deno.test("deletedCoordinates - an a tag that names no coordinate is ignored", () => {
  const deletion = buildEventFixture({ pubkey: AUTHOR, kind: 5, tags: [["a", `1:${AUTHOR}:`], ["a", "nonsense"]] })
  assertEquals(deletedCoordinates(deletion), [])
})

Deno.test("deletedCoordinates - an event that is not a deletion request deletes no coordinate", () => {
  const event = buildEventFixture({ pubkey: AUTHOR, kind: 1, tags: [["a", `30023:${AUTHOR}:article`]] })
  assertEquals(deletedCoordinates(event), [])
})

Deno.test("deletedCoordinates - a coordinate tagged twice is deleted once", () => {
  const deletion = buildEventFixture({
    pubkey: AUTHOR,
    kind: 5,
    tags: [["a", `10001:${AUTHOR}:`], ["a", `10001:${AUTHOR}:`, "wss://relay.example.com"]],
  })
  assertEquals(deletedCoordinates(deletion), [{ kind: 10001, pubkey: AUTHOR, dTag: "" }])
})
