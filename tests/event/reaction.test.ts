import { assertEquals } from "@std/assert"
import { DEFAULT_REACTION } from "../../src/domain/service/reaction.ts"

Deno.test("DEFAULT_REACTION - is the NIP-25 + sentinel", () => {
  assertEquals(DEFAULT_REACTION, "+")
})
