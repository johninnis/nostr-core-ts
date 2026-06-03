import { assertEquals } from "@std/assert"
import {
  buildFileMetadataEvent,
  buildImetaTag,
  type FileMetadata,
  parseFileMetadataEvent,
  parseImetaTag,
  parseImetaTags,
} from "../../src/domain/service/file-metadata.ts"
import { KIND_FILE_METADATA } from "../../src/domain/value-object/kinds.ts"
import type { NostrEvent, Tag } from "../../src/domain/value-object/nostr-event.ts"
import { parseEventId } from "../../src/domain/value-object/event-id.ts"
import { parsePublicKey } from "../../src/domain/value-object/public-key.ts"
import { parseSig } from "../../src/domain/value-object/sig.ts"

const pk = parsePublicKey("a".repeat(64))
const id = parseEventId("b".repeat(64))

const makeEvent = (kind: number, tags: ReadonlyArray<Tag>, content = ""): NostrEvent => ({
  id,
  pubkey: pk,
  kind,
  content,
  tags,
  created_at: 1700000000,
  sig: parseSig("c".repeat(128)),
})

const fullMetadata: FileMetadata = {
  url: "https://example.com/file.jpg",
  mimeType: "image/jpeg",
  hash: "d".repeat(64),
  originalHash: "e".repeat(64),
  size: 90244,
  dimensions: "794x798",
  blurhash: "L55iUPo*4hf;kHkCj^ahXFa$xjod",
  thumbnail: "https://example.com/thumb.jpg",
  image: "https://example.com/preview.jpg",
  summary: "a description",
  alt: "an accessibility caption with spaces",
  fallbacks: ["https://mirror1.example/file.jpg", "https://mirror2.example/file.jpg"],
}

Deno.test("parseFileMetadataEvent - returns null for the wrong kind", () => {
  assertEquals(parseFileMetadataEvent(makeEvent(1, [["url", "https://example.com/a.jpg"]])), null)
})

Deno.test("parseFileMetadataEvent - returns null when no url tag is present", () => {
  assertEquals(parseFileMetadataEvent(makeEvent(KIND_FILE_METADATA, [["m", "image/jpeg"]])), null)
})

Deno.test("parseFileMetadataEvent - parses every field", () => {
  const event = makeEvent(KIND_FILE_METADATA, buildFileMetadataEvent(fullMetadata).tags)
  assertEquals(parseFileMetadataEvent(event), fullMetadata)
})

Deno.test("parseFileMetadataEvent - omits a non-integer size", () => {
  const event = makeEvent(KIND_FILE_METADATA, [["url", "https://example.com/a.jpg"], ["size", "not-a-number"]])
  assertEquals(parseFileMetadataEvent(event), { url: "https://example.com/a.jpg" })
})

Deno.test("parseFileMetadataEvent - ignores value-less tags", () => {
  const event = makeEvent(KIND_FILE_METADATA, [["url", "https://example.com/a.jpg"], ["alt"]])
  assertEquals(parseFileMetadataEvent(event), { url: "https://example.com/a.jpg" })
})

Deno.test("parseImetaTag - returns null for a non-imeta tag", () => {
  assertEquals(parseImetaTag(["e", "abc"]), null)
})

Deno.test("parseImetaTag - returns null without a url entry", () => {
  assertEquals(parseImetaTag(["imeta", "m image/jpeg"]), null)
})

Deno.test("parseImetaTag - splits each entry on the first space only", () => {
  const tag: Tag = ["imeta", "url https://example.com/a.jpg", "alt a caption with spaces"]
  assertEquals(parseImetaTag(tag), { url: "https://example.com/a.jpg", alt: "a caption with spaces" })
})

Deno.test("parseImetaTag - skips entries with no space", () => {
  const tag: Tag = ["imeta", "url https://example.com/a.jpg", "garbage"]
  assertEquals(parseImetaTag(tag), { url: "https://example.com/a.jpg" })
})

Deno.test("parseImetaTags - collects valid imeta tags and skips the rest", () => {
  const tags: ReadonlyArray<Tag> = [
    ["imeta", "url https://example.com/a.jpg"],
    ["p", pk],
    ["imeta", "m image/png"],
    ["imeta", "url https://example.com/b.jpg", "m image/png"],
  ]
  assertEquals(parseImetaTags(tags), [
    { url: "https://example.com/a.jpg" },
    { url: "https://example.com/b.jpg", mimeType: "image/png" },
  ])
})

Deno.test("buildFileMetadataEvent - sets kind, caption content and round-trips", () => {
  const built = buildFileMetadataEvent(fullMetadata, "my caption")
  assertEquals(built.kind, KIND_FILE_METADATA)
  assertEquals(built.content, "my caption")
  assertEquals(parseFileMetadataEvent(makeEvent(built.kind, built.tags, built.content)), fullMetadata)
})

Deno.test("buildFileMetadataEvent - defaults content to an empty string", () => {
  assertEquals(buildFileMetadataEvent({ url: "https://example.com/a.jpg" }).content, "")
})

Deno.test("buildImetaTag - produces an imeta tag that round-trips", () => {
  const tag = buildImetaTag(fullMetadata)
  assertEquals(tag[0], "imeta")
  assertEquals(parseImetaTag(tag), fullMetadata)
})

Deno.test("buildImetaTag - serialises size as a string entry", () => {
  assertEquals(buildImetaTag({ url: "https://example.com/a.jpg", size: 1024 }), [
    "imeta",
    "url https://example.com/a.jpg",
    "size 1024",
  ])
})
