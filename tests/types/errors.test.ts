import { assertEquals, assertInstanceOf, assertThrows } from "@std/assert"
import { InvalidArgumentError, InvariantError, Nip04CryptoError, Nip44CryptoError, NostrError } from "../../mod.ts"
import { publicKeyFixture } from "../../testing.ts"
import { sourceFilesMatching } from "../support/source-files.ts"

Deno.test("InvariantError - is a named Error carrying the message", () => {
  const error = new InvariantError("a digest was not 32 bytes")
  assertInstanceOf(error, Error)
  assertEquals([error.name, error.message], ["InvariantError", "a digest was not 32 bytes"])
})

Deno.test("InvalidArgumentError - is a named Error carrying the message", () => {
  const error = new InvalidArgumentError("an empty url names no file")
  assertInstanceOf(error, Error)
  assertEquals([error.name, error.message], ["InvalidArgumentError", "an empty url names no file"])
})

Deno.test("a brand fixture given a value that is not one throws InvalidArgumentError", () => {
  assertThrows(() => publicKeyFixture("not a key"), InvalidArgumentError)
})

const FAULTS: ReadonlyArray<readonly [string, Error]> = [
  ["InvalidArgumentError", new InvalidArgumentError("x")],
  ["InvariantError", new InvariantError("x")],
  ["Nip04CryptoError", new Nip04CryptoError("x")],
  ["Nip44CryptoError", new Nip44CryptoError("x")],
]

for (const [name, fault] of FAULTS) {
  Deno.test(`${name} - is a NostrError, the root a host catches this library's faults by (ADR-0019)`, () => {
    assertInstanceOf(fault, NostrError)
  })
}

Deno.test("NostrError - no source file throws a bare Error but the vendored NIP-44 file (ADR-0016, ADR-0019)", async () => {
  assertEquals(await sourceFilesMatching(/new Error\(/), ["infrastructure/crypto/nip44-v2.ts"])
})
