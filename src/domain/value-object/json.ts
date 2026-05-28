/**
 * Catch-and-return-null wrapper around `JSON.parse`. Use this anywhere the domain or application
 * layer needs to read external JSON: it converts the spec's "throw on malformed input" contract
 * into a `null`-or-value Result, which composes with the rest of the codebase's Result-style
 * error handling and removes one `deno-lint-ignore innis/no-catch-in-layer` per callsite.
 *
 * Callers that need to distinguish "couldn't parse" from "successfully parsed `null`" should
 * wrap this with a typed parse function rather than expanding the helper's API surface.
 */
export const tryParseJson = (text: string): unknown => {
  try {
    return JSON.parse(text)
  } // deno-lint-ignore innis/no-catch-in-layer -- single sanctioned catch site for JSON.parse across the whole library
  catch {
    return null
  }
}
