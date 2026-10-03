import { assertEquals, assertRejects } from "@std/assert"
import { createHttpClient } from "../../src/infrastructure/http/fetch-http-client.ts"
import { failure } from "../../src/domain/value-object/result.ts"

const withFetchStub = async (
  stub: typeof globalThis.fetch,
  body: () => Promise<void>,
): Promise<void> => {
  const original = globalThis.fetch
  globalThis.fetch = stub
  try {
    await body()
  } finally {
    globalThis.fetch = original
  }
}

Deno.test("createHttpClient - returns ok HttpResponse for 2xx", async () => {
  await withFetchStub(
    () => Promise.resolve(new Response('{"x":1}', { status: 200, headers: { "content-type": "application/json" } })),
    async () => {
      const client = createHttpClient()
      const result = await client.request({ url: "https://example.com", method: "GET" })
      assertEquals(result.success, true)
      if (!result.success) throw new Error("expected success")
      assertEquals(result.value.status, 200)
      const body = await result.value.json()
      assertEquals(body.success, true)
      if (body.success) assertEquals(body.value, { x: 1 })
    },
  )
})

Deno.test("createHttpClient - body.json() returns a malformed-body failure, not a network one, when the body isn't JSON", async () => {
  await withFetchStub(
    () => Promise.resolve(new Response("not json", { status: 200 })),
    async () => {
      const client = createHttpClient()
      const result = await client.request({ url: "https://example.com", method: "GET" })
      if (!result.success) throw new Error("expected request success")
      assertEquals(await result.value.json(), failure({ type: "malformed-body", message: "response body is not JSON" }))
    },
  )
})

Deno.test("createHttpClient - body.json() refuses a body that is not UTF-8 as malformed, never reading it lossily", async () => {
  const notUtf8 = new Uint8Array([0x7b, 0x22, 0x61, 0x22, 0x3a, 0x22, 0xff, 0x22, 0x7d])
  const client = createHttpClient("refuse-private", () => Promise.resolve(new Response(notUtf8, { status: 200 })))
  const result = await client.request({ url: "https://example.com", method: "GET" })
  if (!result.success) throw new Error("expected request success")
  assertEquals(await result.value.json(), failure({ type: "malformed-body", message: "response body is not UTF-8" }))
})

Deno.test("createHttpClient - body.json() reads a UTF-8 body's multi-byte characters as written", async () => {
  const client = createHttpClient("refuse-private", () => Promise.resolve(new Response('{"a":"é€"}', { status: 200 })))
  const result = await client.request({ url: "https://example.com", method: "GET" })
  if (!result.success) throw new Error("expected request success")
  assertEquals(await result.value.json(), { success: true, value: { a: "é€" } })
})

Deno.test("createHttpClient - returns a ServerFailure for status >= 400", async () => {
  await withFetchStub(
    () => Promise.resolve(new Response("nope", { status: 503 })),
    async () => {
      const client = createHttpClient()
      const result = await client.request({ url: "https://example.com", method: "GET" })
      assertEquals(result.success, false)
      if (result.success) throw new Error("expected failure")
      assertEquals(result.error.type, "server")
      if (result.error.type !== "server") return
      assertEquals(result.error.status, 503)
      assertEquals(result.error.message, "nope")
    },
  )
})

Deno.test("createHttpClient - prefers x-reason header over response text on a ServerFailure", async () => {
  await withFetchStub(
    () => Promise.resolve(new Response("body text ignored", { status: 400, headers: { "x-reason": "bad input" } })),
    async () => {
      const client = createHttpClient()
      const result = await client.request({ url: "https://example.com", method: "GET" })
      assertEquals(result.success, false)
      if (result.success || result.error.type !== "server") throw new Error("expected a server failure")
      assertEquals(result.error.message, "bad input")
    },
  )
})

Deno.test("createHttpClient - returns a NetworkFailure when fetch throws", async () => {
  await withFetchStub(
    () => Promise.reject(new TypeError("Failed to fetch")),
    async () => {
      const client = createHttpClient()
      const result = await client.request({ url: "https://example.com", method: "GET" })
      assertEquals(result.success, false)
      if (result.success || result.error.type !== "network") throw new Error("expected a network failure")
      assertEquals(result.error.message, "Failed to fetch")
    },
  )
})

Deno.test("createHttpClient - passes method, headers, and body through to fetch", async () => {
  let captured: { input: RequestInfo | URL; init: RequestInit } | null = null
  await withFetchStub(
    (input, init) => {
      captured = { input, init: init ?? {} }
      return Promise.resolve(new Response("ok", { status: 200 }))
    },
    async () => {
      const client = createHttpClient()
      await client.request({
        url: "https://example.com/api",
        method: "POST",
        headers: { authorization: "Bearer x" },
        body: '{"k":"v"}',
      })
      if (!captured) throw new Error("expected fetch to be called")
      assertEquals(captured.input, "https://example.com/api")
      assertEquals(captured.init.method, "POST")
      assertEquals(new Headers(captured.init.headers).get("authorization"), "Bearer x")
      assertEquals(captured.init.body, '{"k":"v"}')
    },
  )
})

Deno.test("createHttpClient - body.text() returns Ok(string) on 2xx", async () => {
  await withFetchStub(
    () => Promise.resolve(new Response("hello", { status: 200 })),
    async () => {
      const client = createHttpClient()
      const result = await client.request({ url: "https://example.com", method: "GET" })
      if (!result.success) throw new Error("expected request success")
      const body = await result.value.text()
      assertEquals(body.success, true)
      if (body.success) assertEquals(body.value, "hello")
    },
  )
})

Deno.test("createHttpClient - body.blob() returns Ok(Blob) on 2xx", async () => {
  await withFetchStub(
    () => Promise.resolve(new Response(new Uint8Array([1, 2, 3]), { status: 200 })),
    async () => {
      const client = createHttpClient()
      const result = await client.request({ url: "https://example.com", method: "GET" })
      if (!result.success) throw new Error("expected request success")
      const body = await result.value.blob()
      assertEquals(body.success, true)
      if (body.success) assertEquals(body.value.size, 3)
    },
  )
})

const extractSignal = (init: unknown): AbortSignal | null => {
  if (!init || typeof init !== "object" || !("signal" in init)) return null
  const sig = init.signal
  return sig instanceof AbortSignal ? sig : null
}

const fetchThatAbortsOnSignal: typeof globalThis.fetch = (_input, init) => {
  const signal = extractSignal(init)
  return new Promise<Response>((_resolve, reject) => {
    if (!signal) return
    if (signal.aborted) {
      reject(signal.reason ?? new DOMException("aborted", "AbortError"))
      return
    }
    signal.addEventListener("abort", () => reject(signal.reason ?? new DOMException("aborted", "AbortError")), {
      once: true,
    })
  })
}

Deno.test("createHttpClient - forwards a caller-supplied signal to fetch and aborts mid-request", async () => {
  await withFetchStub(fetchThatAbortsOnSignal, async () => {
    const client = createHttpClient()
    const controller = new AbortController()
    const pending = client.request({ url: "https://example.com", method: "GET", signal: controller.signal })
    controller.abort(new DOMException("caller cancelled", "AbortError"))
    const result = await pending
    assertEquals(result.success, false)
    if (result.success || result.error.type !== "network") throw new Error("expected a network failure")
  })
})

Deno.test("createHttpClient - a caller abort carrying a reason of its own is a NetworkFailure", async () => {
  const controller = new AbortController()
  const pending = createHttpClient("refuse-private", fetchThatAbortsOnSignal).request({
    url: "https://example.com",
    method: "GET",
    signal: controller.signal,
  })
  controller.abort(new Error("caller's own reason"))
  assertEquals(await pending, failure({ type: "network", message: "caller's own reason" }))
})

Deno.test("createHttpClient - a fetch that throws anything but a transport failure is a fault that propagates", async () => {
  const client = createHttpClient("refuse-private", () => Promise.reject(new RangeError("a bug in the fetch")))
  await assertRejects(
    () => client.request({ url: "https://example.com", method: "GET" }),
    RangeError,
    "a bug in the fetch",
  )
})

Deno.test("createHttpClient - caps the error-body read at 8 KiB and uses x-reason in preference", async () => {
  const huge = "x".repeat(20 * 1024)
  await withFetchStub(
    () => Promise.resolve(new Response(huge, { status: 500 })),
    async () => {
      const client = createHttpClient()
      const result = await client.request({ url: "https://example.com", method: "GET" })
      if (result.success || result.error.type !== "server") throw new Error("expected a server failure")
      if (result.error.message.length > 8 * 1024) throw new Error("error body should be capped at 8KiB")
    },
  )
})

Deno.test("createHttpClient - error-body cap counts bytes, not characters (multi-byte UTF-8 cannot overshoot)", async () => {
  const huge = "\u{1F4A9}".repeat(4096)
  await withFetchStub(
    () => Promise.resolve(new Response(huge, { status: 500 })),
    async () => {
      const client = createHttpClient()
      const result = await client.request({ url: "https://example.com", method: "GET" })
      if (result.success || result.error.type !== "server") throw new Error("expected a server failure")
      if (result.error.message.length > 4096) throw new Error("byte-based cap must limit multi-byte UTF-8 too")
    },
  )
})

Deno.test("createHttpClient - { fetch } override is used instead of globalThis.fetch", async () => {
  let calls = 0
  const stub: typeof globalThis.fetch = (_input, _init) => {
    calls++
    return Promise.resolve(new Response("ok", { status: 200 }))
  }
  const client = createHttpClient("refuse-private", stub)
  const result = await client.request({ url: "https://example.com", method: "GET" })
  assertEquals(result.success, true)
  assertEquals(calls, 1)
})

const capturingFetch = (response: () => Response): { fetch: typeof globalThis.fetch; signal: () => AbortSignal } => {
  let captured: AbortSignal | null = null
  return {
    fetch: (_input, init) => {
      captured = init?.signal ?? null
      return Promise.resolve(response())
    },
    signal: () => {
      if (captured === null) throw new Error("fetch was not given a signal")
      return captured
    },
  }
}

Deno.test("createHttpClient - a caller abort after the headers arrive still aborts the body read", async () => {
  const stub = capturingFetch(() => new Response("body", { status: 200 }))
  const controller = new AbortController()
  const result = await createHttpClient("refuse-private", stub.fetch).request({
    url: "https://example.com",
    method: "GET",
    signal: controller.signal,
  })
  assertEquals(result.success, true)
  controller.abort()
  assertEquals(stub.signal().aborted, true)
})

Deno.test("createHttpClient - a body stream that errors is a NetworkFailure from its reader", async () => {
  const failingBody = new ReadableStream<Uint8Array>({ pull: (controller) => controller.error(new TypeError("reset")) })
  const result = await createHttpClient("refuse-private", () => Promise.resolve(new Response(failingBody))).request({
    url: "https://example.com",
    method: "GET",
  })
  if (!result.success) throw new Error("expected the headers to arrive")
  assertEquals(await result.value.text(), failure({ type: "network", message: "reset" }))
})

Deno.test("createHttpClient - a failing error-body stream yields a ServerFailure describing the stream error", async () => {
  const streamError = new Error("connection reset")
  const failingBody = new ReadableStream<Uint8Array>({ pull: (controller) => controller.error(streamError) })
  const client = createHttpClient("refuse-private", () => Promise.resolve(new Response(failingBody, { status: 502 })))
  const result = await client.request({ url: "https://example.com", method: "GET" })
  if (result.success || result.error.type !== "server") throw new Error("expected a server failure")
  assertEquals(result.error, { type: "server", status: 502, message: "error body unreadable: connection reset" })
})
