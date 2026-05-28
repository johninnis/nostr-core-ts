import { TaggedError } from "./tagged-error.ts"

/** Thrown by the NIP-04 codec on a malformed `<ct>?iv=<iv>` payload or wrong IV length. */
export class Nip04DecryptError extends TaggedError<"Nip04DecryptError"> {
  constructor(message: string, cause?: unknown) {
    super("Nip04DecryptError", message, cause)
  }
}
