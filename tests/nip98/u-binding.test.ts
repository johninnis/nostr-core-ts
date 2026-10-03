import { assertEquals } from "@std/assert"
import {
  createNip98Validator,
  DEFAULT_TIMESTAMP_TOLERANCE_SECONDS,
} from "../../src/application/service/nip98-validator.ts"
import type { Nip98ReplayGuard } from "../../src/application/port/nip98-replay-guard.ts"
import type { Nip98ValidationFailure } from "../../src/domain/failure/nip98-validation-failure.ts"
import { KIND_HTTP_AUTH } from "../../src/domain/value-object/kinds.ts"
import type { NostrEvent } from "../../src/domain/value-object/nostr-event.ts"
import { createLocalSigner } from "../../src/infrastructure/crypto/local-signer.ts"
import { secretKeyOf } from "../support/keys.ts"
import { httpUrlFixture } from "../../testing.ts"

const AT = 1800000000

const acceptEveryEvent: Nip98ReplayGuard = { recordOnce: () => Promise.resolve(true) }

const signedAuth = async (url: string): Promise<NostrEvent> => {
  const signed = await createLocalSigner(secretKeyOf(0x11)).signEvent({
    kind: KIND_HTTP_AUTH,
    created_at: AT,
    tags: [["u", url], ["method", "GET"]],
    content: "",
  })
  if (!signed.success) throw new Error("a local signer always signs")
  return signed.value
}

const U_BINDING: ReadonlyArray<readonly [string, string, string, Nip98ValidationFailure | "accepted"]> = [
  ["a scheme other than http or https", "ftp://x.example/a", "https://x.example/a", "u-malformed"],
  ["an unresolved dot segment", "https://x.example/a/../b", "https://x.example/b", "u-mismatch"],
  ["an empty query against none", "https://x.example/a?", "https://x.example/a", "u-mismatch"],
  ["a space against its percent-encoding", "https://x.example/a b", "https://x.example/a%20b", "u-mismatch"],
  [
    "an encoded unreserved character against the character",
    "https://x.example/%7e",
    "https://x.example/~",
    "u-mismatch",
  ],
  ["a path in another case", "https://x.example/A", "https://x.example/a", "u-mismatch"],
  [
    "the scheme and host in capitals with the default port",
    "HTTPS://X.EXAMPLE:443/a",
    "https://x.example/a",
    "accepted",
  ],
  ["a fragment", "https://x.example/a#frag", "https://x.example/a", "accepted"],
  ["credentials", "https://user:pw@x.example/a", "https://x.example/a", "accepted"],
  ["no path against the root path", "https://x.example", "https://x.example/", "accepted"],
  ["another port on both sides", "https://x.example:8443/a", "https://x.example:8443/a", "accepted"],
]

for (const [description, claimed, requested, expected] of U_BINDING) {
  Deno.test(`validate - a u tag differing by ${description} is ${expected} (shared ADR-0081)`, async () => {
    const validator = createNip98Validator(acceptEveryEvent, DEFAULT_TIMESTAMP_TOLERANCE_SECONDS, () => AT)
    const result = await validator.validate({
      event: await signedAuth(claimed),
      url: httpUrlFixture(requested),
      method: "GET",
    })
    assertEquals(result.success ? "accepted" : result.error, expected)
  })
}
