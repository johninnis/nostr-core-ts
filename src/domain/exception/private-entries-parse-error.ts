import { TaggedError } from "./tagged-error.ts"

/** Thrown by `decryptPrivateEntries` when the decrypted ciphertext is not a valid JSON array of tags. */
export class PrivateEntriesParseError extends TaggedError<"PrivateEntriesParseError"> {
  constructor(message: string, cause?: unknown) {
    super("PrivateEntriesParseError", message, cause)
  }
}
