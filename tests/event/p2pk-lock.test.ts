import { assertEquals } from "@std/assert"
import { parseCompressedKey, parseP2pkLockKey } from "../../src/domain/service/p2pk-secret.ts"
import { OTHER_P2PK_KEY, P2PK_KEY, secretFor } from "../support/nutzap.ts"

interface P2pkLockVectors {
  readonly vectors: ReadonlyArray<readonly [string, string | null]>
}

const VECTORS: P2pkLockVectors = JSON.parse(
  await Deno.readTextFile(new URL("./p2pk-lock-vectors.json", import.meta.url)),
)

Deno.test("parseP2pkLockKey - the shared vectors are fully loaded", () => {
  assertEquals(VECTORS.vectors.length, 47)
})

Deno.test("parseP2pkLockKey - reads every shared vector's lock as the PHP P2pkSecretParser reads it", () => {
  const disagreements = VECTORS.vectors.filter(([secret, expected]) => parseP2pkLockKey(secret) !== expected)
  assertEquals(disagreements, [])
})

Deno.test("parseP2pkLockKey - the lock of a P2PK secret is its data key (shared ADR-0121)", () => {
  assertEquals(parseP2pkLockKey(secretFor(`02${P2PK_KEY}`)), P2PK_KEY)
})

Deno.test("parseP2pkLockKey - a secret that also lets another key spend locks to no key (shared ADR-0121)", () => {
  const secret = JSON.stringify(["P2PK", {
    nonce: "n",
    data: `02${P2PK_KEY}`,
    tags: [["pubkeys", `02${OTHER_P2PK_KEY}`]],
  }])
  assertEquals(parseP2pkLockKey(secret), null)
})

Deno.test("parseP2pkLockKey - a secret whose lock lapses locks to no key (shared ADR-0121)", () => {
  const secret = JSON.stringify(["P2PK", { nonce: "n", data: `02${P2PK_KEY}`, tags: [["locktime", "1689418329"]] }])
  assertEquals(parseP2pkLockKey(secret), null)
})

Deno.test("parseCompressedKey - reads a compressed key as its x-coordinate", () => {
  assertEquals(parseCompressedKey(`02${P2PK_KEY}`), P2PK_KEY)
})

Deno.test("parseCompressedKey - a 03 prefix is the same key, as NUT-11 compares keys (shared ADR-0121)", () => {
  assertEquals(parseCompressedKey(`03${P2PK_KEY}`), P2PK_KEY)
})

Deno.test("parseCompressedKey - reads upper-case hex as its lower-case x-coordinate (shared ADR-0121)", () => {
  assertEquals(parseCompressedKey(`02${P2PK_KEY.toUpperCase()}`), P2PK_KEY)
})

for (
  const [what, key] of [
    ["a bare x-coordinate", P2PK_KEY],
    ["an uncompressed prefix", `04${P2PK_KEY}`],
    ["a short x-coordinate", `02${P2PK_KEY.slice(1)}`],
    ["a long x-coordinate", `02${P2PK_KEY}00`],
    ["a character that is not hex", `02${P2PK_KEY.slice(1)}g`],
    ["the empty string", ""],
  ] as const
) {
  Deno.test(`parseCompressedKey - ${what} is no key`, () => {
    assertEquals(parseCompressedKey(key), null)
  })
}
