import { assertEquals, assertThrows } from "@std/assert"
import { InvalidArgumentError } from "../../src/domain/exception/invalid-argument-error.ts"
import { buildDraftWrap } from "../../src/domain/service/builder.ts"
import { KIND_DRAFT_WRAP, KIND_LONGFORM_CONTENT } from "../../src/domain/value-object/kinds.ts"

Deno.test("buildDraftWrap - emits kind 31234", () => {
  const event = buildDraftWrap({ dTag: "my-draft", draftKind: KIND_LONGFORM_CONTENT, content: "encrypted" })
  assertEquals(event.kind, KIND_DRAFT_WRAP)
})

Deno.test("buildDraftWrap - writes the encrypted content unchanged", () => {
  const event = buildDraftWrap({ dTag: "my-draft", draftKind: KIND_LONGFORM_CONTENT, content: "encrypted" })
  assertEquals(event.content, "encrypted")
})

Deno.test("buildDraftWrap - names the draft in a d tag", () => {
  const event = buildDraftWrap({ dTag: "my-draft", draftKind: KIND_LONGFORM_CONTENT, content: "encrypted" })
  assertEquals(event.tags.find((t) => t[0] === "d")?.[1], "my-draft")
})

Deno.test("buildDraftWrap - names the draft's kind in a k tag (NIP-37: the k tag is required)", () => {
  const event = buildDraftWrap({ dTag: "my-draft", draftKind: KIND_LONGFORM_CONTENT, content: "encrypted" })
  assertEquals(event.tags.find((t) => t[0] === "k")?.[1], String(KIND_LONGFORM_CONTENT))
})

Deno.test("buildDraftWrap - an empty content signals a deleted draft (NIP-37)", () => {
  const event = buildDraftWrap({ dTag: "my-draft", draftKind: KIND_LONGFORM_CONTENT, content: "" })
  assertEquals(event.content, "")
})

Deno.test("buildDraftWrap - uses provided createdAt", () => {
  const event = buildDraftWrap({ dTag: "d", draftKind: 1, content: "c", createdAt: 1234567890 })
  assertEquals(event.created_at, 1234567890)
})

Deno.test("buildDraftWrap - refuses a draft kind that is not a whole number", () => {
  assertThrows(
    () => buildDraftWrap({ dTag: "d", draftKind: 30023.5, content: "c" }),
    InvalidArgumentError,
    "whole-number event kind",
  )
})
