const isCodecRefusal = (error: unknown): error is Error =>
  error instanceof Error && Object.getPrototypeOf(error) === Error.prototype

// Deliberate: only a plain Error is a refusal of the input; the codecs check their keys before any step — see ADR-0008
/**
 * Run a codec step, rethrowing the refusal of its input — the plain `Error` the vendored NIP-44 code and the noble
 * primitives throw for a bad MAC, padding, version, length, base64 or off-curve point — as `refusal(error)`. Any other
 * throw, such as a `TypeError` from a bug, propagates unchanged. A codec checks its own keys before running a step, so
 * a malformed key is its `InvalidArgumentError` and never a refusal here.
 */
export const refusedAs = <T>(step: () => T, refusal: (cause: Error) => Error): T => {
  try {
    return step()
  } catch (error) {
    if (isCodecRefusal(error)) throw refusal(error)
    throw error
  }
}
