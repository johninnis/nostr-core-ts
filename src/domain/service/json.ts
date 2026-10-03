import type { JsonParseFailure } from "../failure/json-parse-failure.ts"
import type { Result } from "../value-object/result.ts"
import { failure, ok } from "../value-object/result.ts"
import type { JsonValue } from "../value-object/json-serialisable.ts"
import { isRecord } from "./guards.ts"

const SURROGATE_OR_NUL_ESCAPE = /\\u(?:[dD][89a-fA-F]|0000)/
const NUL = "\0"

const isReadableKey = (key: string): boolean => key.isWellFormed() && !key.startsWith(NUL)

const holdsOnlyReadableText = (value: unknown): boolean => {
  if (typeof value === "string") return value.isWellFormed()
  if (Array.isArray(value)) return value.every(holdsOnlyReadableText)
  return !isRecord(value) ||
    Object.entries(value).every(([key, field]) => isReadableKey(key) && holdsOnlyReadableText(field))
}

const decodeJson = (text: string): Result<JsonValue, JsonParseFailure> => {
  try {
    return ok(JSON.parse(text))
  } catch {
    return failure("malformed-json")
  }
}

// Deliberate: an unpaired surrogate or a key starting with NUL is malformed, as PHP reads it — see shared ADR-0104/0092
/**
 * Parse `text` as JSON: `ok(value)`, a {@link JsonValue}, for any well-formed document — including the literal `null` —
 * or `failure("malformed-json")` when it is malformed, when it or any string it decodes to, an object key included,
 * holds an unpaired UTF-16 surrogate, which no UTF-8 text can carry (shared ADR-0104), or when an object key starts
 * with NUL (shared ADR-0092). The one way the library reads external JSON.
 */
export const parseJson = (text: string): Result<JsonValue, JsonParseFailure> => {
  if (!text.isWellFormed()) return failure("malformed-json")
  const parsed = decodeJson(text)
  const unreadable = parsed.success && SURROGATE_OR_NUL_ESCAPE.test(text) && !holdsOnlyReadableText(parsed.value)
  return unreadable ? failure("malformed-json") : parsed
}
