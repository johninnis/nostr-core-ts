import { assertEquals } from "@std/assert"
import { buildRumour } from "../../src/domain/service/rumour.ts"
import type { EventToSign } from "../../src/domain/service/event-id.ts"
import { InvalidArgumentError } from "../../src/domain/exception/invalid-argument-error.ts"
import { publicKeyFixture } from "../../testing.ts"

const FIELDS: EventToSign = {
  kind: 14,
  pubkey: publicKeyFixture("b".repeat(64)),
  created_at: 1700000000,
  tags: [],
  content: "hello",
}

const NOT_NIP01_FIELDS: ReadonlyArray<Partial<EventToSign>> = [
  { kind: 1.5 },
  { kind: -1 },
  { kind: 70000 },
  { kind: Number.NaN },
  { created_at: 1.5 },
  { created_at: -5 },
  { created_at: Number.NaN },
  { created_at: Number.POSITIVE_INFINITY },
]

const outcomeOf = (fields: EventToSign): string => {
  try {
    buildRumour(fields)
    return "built"
  } catch (error) {
    return error instanceof InvalidArgumentError ? "refused" : String(error)
  }
}

Deno.test("buildRumour - throws InvalidArgumentError for a kind or created_at parseNostrEvent refuses", () => {
  assertEquals(
    NOT_NIP01_FIELDS.map((override) => outcomeOf({ ...FIELDS, ...override })),
    NOT_NIP01_FIELDS.map(() => "refused"),
  )
})

Deno.test("buildRumour - builds the bounds of kind and created_at", () => {
  assertEquals(
    [{ kind: 0 }, { kind: 65535 }, { created_at: 0 }, { created_at: Number.MAX_SAFE_INTEGER }].map((override) =>
      outcomeOf({ ...FIELDS, ...override })
    ),
    ["built", "built", "built", "built"],
  )
})

Deno.test("buildRumour - an addressable kind with no d tag gains the empty identifier (shared ADR-0007)", () => {
  assertEquals(buildRumour({ ...FIELDS, kind: 30078, content: "" }).tags, [["d", ""]])
})

Deno.test("buildRumour - an addressable kind's d tag is kept as written", () => {
  assertEquals(buildRumour({ ...FIELDS, kind: 30078, tags: [["t", "x"], ["d", "a"]] }).tags, [["t", "x"], ["d", "a"]])
})

Deno.test("buildRumour - a kind that is not addressable gains no d tag", () => {
  assertEquals(buildRumour({ ...FIELDS, kind: 10002 }).tags, [])
})

Deno.test("buildRumour - an addressable kind with no d tag hashes as Rumour::draft does (shared vector with innis/nostr-core)", () => {
  assertEquals(
    buildRumour({ ...FIELDS, kind: 30078, tags: [], content: "" }).id,
    "f26b7e1b6f65c7707f92dded2f80696704684a36f01ef445372b2d24453dd537",
  )
})
