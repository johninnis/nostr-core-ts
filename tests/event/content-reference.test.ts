import { assertEquals } from "@std/assert"
import { encodeEventIdToNote, encodeNaddr, encodePubkeyToNpub } from "../../src/domain/service/bech32.ts"
import { extractContentReferences, leadingContentReference } from "../../src/domain/service/content-reference.ts"
import { eventIdFixture, publicKeyFixture } from "../../testing.ts"

const pubkey = publicKeyFixture("a".repeat(64))
const eventId = eventIdFixture("b".repeat(64))
const npub = encodePubkeyToNpub(pubkey)
const note = encodeEventIdToNote(eventId)

Deno.test("extractContentReferences - returns nothing for content without references", () => {
  assertEquals(extractContentReferences("just words"), [])
})

Deno.test("extractContentReferences - finds a nostr: URI with its matched text, identifier and index", () => {
  const [reference] = extractContentReferences(`hi nostr:${npub}!`)
  assertEquals(
    { match: reference?.match, identifier: reference?.identifier, index: reference?.index },
    { match: `nostr:${npub}`, identifier: npub, index: 3 },
  )
})

Deno.test("extractContentReferences - measures the index in UTF-16 code units (shared ADR-0107)", () => {
  const [reference] = extractContentReferences(`é😀 nostr:${npub}`)
  assertEquals(reference?.index, 4)
})

Deno.test("extractContentReferences - finds a bare entity", () => {
  const [reference] = extractContentReferences(`see ${note}`)
  assertEquals(reference?.match, note)
})

Deno.test("extractContentReferences - finds a bare entity after an underscore", () => {
  const [reference] = extractContentReferences(`_${npub}`)
  assertEquals(reference?.index, 1)
})

Deno.test("extractContentReferences - skips a bare entity after a letter or digit", () => {
  assertEquals(extractContentReferences(`x${npub} 9${note}`), [])
})

Deno.test("extractContentReferences - a nostr: URI whose entity runs on into further letters is no reference", () => {
  assertEquals(extractContentReferences(`x nostr:${npub}xyz nostr:${note}xyz`), [])
})

Deno.test("extractContentReferences - a bare entity that runs on into further letters is no reference", () => {
  assertEquals(extractContentReferences(`x ${npub}xyz ${note}xyz`), [])
})

Deno.test("extractContentReferences - an entity ends at the first character that is not a letter or digit", () => {
  assertEquals(extractContentReferences(`x nostr:${npub}, ${note}.`).map((reference) => reference.identifier), [
    npub,
    note,
  ])
})

Deno.test("extractContentReferences - decodes the entity", () => {
  const [reference] = extractContentReferences(`nostr:${note}`)
  assertEquals(reference?.entity, { type: "note", eventId, pubkey: null })
})

Deno.test("extractContentReferences - decodes an naddr", () => {
  const naddr = encodeNaddr({ kind: 30023, pubkey, dTag: "post" }) ?? ""
  const [reference] = extractContentReferences(`nostr:${naddr}`)
  assertEquals(reference?.entity.type, "naddr")
})

Deno.test("extractContentReferences - returns references in content order", () => {
  const references = extractContentReferences(`${note} then nostr:${npub}`)
  assertEquals(references.map((reference) => reference.entity.type), ["note", "npub"])
})

Deno.test("extractContentReferences - keeps a repeated reference each time it appears", () => {
  assertEquals(extractContentReferences(`${npub} ${npub}`).length, 2)
})

Deno.test("extractContentReferences - skips a match that does not decode", () => {
  assertEquals(extractContentReferences(`nostr:npub1notbech32 and ${note}`).map((r) => r.identifier), [note])
})

Deno.test("extractContentReferences - gives the same result on repeated calls", () => {
  const content = `nostr:${npub}`
  assertEquals(extractContentReferences(content), extractContentReferences(content))
})

Deno.test("extractContentReferences - finds several distinct entities in one body", () => {
  assertEquals(extractContentReferences(`${npub} then later ${note}`).map((r) => r.identifier), [npub, note])
})

Deno.test("leadingContentReference - reads a nostr: URI at the start of the content", () => {
  const reference = leadingContentReference(`nostr:${npub} and more`)
  assertEquals({ match: reference?.match, identifier: reference?.identifier, index: reference?.index }, {
    match: `nostr:${npub}`,
    identifier: npub,
    index: 0,
  })
})

Deno.test("leadingContentReference - returns null when the reference is not at the start", () => {
  assertEquals(leadingContentReference(`see nostr:${npub}`), null)
})

Deno.test("leadingContentReference - returns null when the leading entity does not decode", () => {
  assertEquals(leadingContentReference("nostr:npub1notbech32"), null)
})

Deno.test("leadingContentReference - gives the same result on repeated calls", () => {
  const content = `nostr:${note}`
  assertEquals(leadingContentReference(content), leadingContentReference(content))
})
