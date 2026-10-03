import { assertEquals } from "@std/assert"
import { isUserRejection } from "../../src/domain/service/user-rejection.ts"

Deno.test("isUserRejection - true for a message containing 'rejected'", () => {
  assertEquals(isUserRejection("request was rejected by user"), true)
})

Deno.test("isUserRejection - true for a message containing 'denied', case-insensitively", () => {
  assertEquals(isUserRejection("Permission DENIED"), true)
})

Deno.test("isUserRejection - true for 'cancel', 'canceled' and 'cancelled'", () => {
  assertEquals(["user cancel", "user canceled", "user cancelled"].map(isUserRejection), [true, true, true])
})

Deno.test("isUserRejection - matches whole words only", () => {
  assertEquals(isUserRejection("unrejectedness"), false)
})

Deno.test("isUserRejection - false for an unrelated message", () => {
  assertEquals(isUserRejection("timeout"), false)
})

Deno.test("isUserRejection - true for the words the NIP-46 bunker in this stack replies with on a decline", () => {
  assertEquals(isUserRejection("user rejected"), true)
})
