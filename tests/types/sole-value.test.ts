import { assertEquals } from "@std/assert"
import { soleValue } from "../../src/domain/value-object/sole-tag-value.ts"

Deno.test("soleValue - no values state none", () => {
  assertEquals(soleValue([]), { state: "absent", value: null })
})

Deno.test("soleValue - a value repeated is one claim", () => {
  assertEquals(soleValue(["a", "a"]), { state: "one", value: "a" })
})

Deno.test("soleValue - values that differ state none", () => {
  assertEquals(soleValue(["a", "b"]), { state: "disagreeing", value: null })
})

Deno.test("soleValue - the empty string is a value", () => {
  assertEquals(soleValue([""]), { state: "one", value: "" })
})

Deno.test("soleValue - values with one key are one claim", () => {
  assertEquals(soleValue([{ id: 1 }, { id: 1 }], ({ id }) => id), { state: "one", value: { id: 1 } })
})

Deno.test("soleValue - values with different keys disagree", () => {
  assertEquals(soleValue([{ id: 1 }, { id: 2 }], ({ id }) => id).state, "disagreeing")
})
