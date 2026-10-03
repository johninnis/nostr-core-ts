import { assertEquals } from "@std/assert"
import { createNip98Validator } from "../../src/application/service/nip98-validator.ts"
import type { Nip98ReplayGuard } from "../../src/application/port/nip98-replay-guard.ts"
import { encodeAuthHeader } from "../../src/domain/service/auth-header.ts"
import { sha256Hex } from "../../src/domain/service/sha256.ts"
import { KIND_HTTP_AUTH } from "../../src/domain/value-object/kinds.ts"
import { failure, ok } from "../../src/domain/value-object/result.ts"
import { createLocalSigner } from "../../src/infrastructure/crypto/local-signer.ts"
import { keyPairOf } from "../support/keys.ts"
import { httpUrlFixture } from "../../testing.ts"

const AT = 1800000000
const TARGET_URL = httpUrlFixture("https://x.example/upload")
const AUTHOR = keyPairOf(0x12)

const acceptEveryEvent: Nip98ReplayGuard = { recordOnce: () => Promise.resolve(true) }

const authHeaderFor = async (payloadHash: string): Promise<string> => {
  const signed = await createLocalSigner(AUTHOR.sk).signEvent({
    kind: KIND_HTTP_AUTH,
    created_at: AT,
    tags: [["u", TARGET_URL], ["method", "POST"], ["payload", payloadHash]],
    content: "",
  })
  if (!signed.success) throw new Error("a local signer always signs")
  const header = encodeAuthHeader(signed.value)
  if (header === null) throw new Error("a short request's header is within the bound")
  return header
}

const validate = async (body: Uint8Array, payloadHash: string) =>
  await createNip98Validator(acceptEveryEvent, 60, () => AT).validateAuthHeader({
    authHeader: await authHeaderFor(payloadHash),
    url: TARGET_URL,
    method: "POST",
    body,
  })

Deno.test("validateAuthHeader - hashes a byte body, such as an uploaded file, and matches the payload tag", async () => {
  const body = new Uint8Array([0xff, 0x00, 0xd8, 0x01])
  assertEquals(await validate(body, sha256Hex(body)), ok(AUTHOR.pk))
})

Deno.test("validateAuthHeader - an empty byte body is no body, so a payload tag is unexpected", async () => {
  const empty = new Uint8Array()
  assertEquals(await validate(empty, sha256Hex(empty)), failure("payload-unexpected"))
})
