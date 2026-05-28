import { assertEquals } from "@std/assert"
import { SignerError, type SignerErrorTag } from "../../src/domain/exception/signer-error.ts"

Deno.test("signerError - constructs SignerError with given tag and message", () => {
  const err = new SignerError("no-signer", "no extension installed")
  assertEquals(err.tag, "no-signer")
  assertEquals(err.message, "no extension installed")
})

Deno.test("signerError - accepts every SignerErrorTag", () => {
  const tags: ReadonlyArray<SignerErrorTag> = [
    "no-signer",
    "disconnected",
    "decrypt-failed",
    "encrypt-failed",
  ]
  for (const tag of tags) {
    assertEquals(new SignerError(tag, "x").tag, tag)
  }
})

Deno.test("signerError - returns a fresh object on each call", () => {
  const a = new SignerError("no-signer", "x")
  const b = new SignerError("no-signer", "x")
  assertEquals(a === b, false)
})
