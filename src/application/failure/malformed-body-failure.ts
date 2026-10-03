/**
 * A response the server did send, whose body is not what the reader parses: `HttpResponse.json()` on a body that is not
 * UTF-8 or not JSON. The exchange succeeded, so this is not a `NetworkFailure`; `message` describes the body for
 * display.
 */
export interface MalformedBodyFailure {
  readonly type: "malformed-body"
  readonly message: string
}
