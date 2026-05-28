import { assertEquals } from "@std/assert"
import { createHttpClient } from "../../src/infrastructure/adapter/fetch-http-client-adapter.ts"
import { NetworkError, ServerError } from "../../src/application/port/http.ts"

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

Deno.test("createHttpClient - body.json() returns a NetworkError Result when the body isn't JSON", async () => {
  await withFetchStub(
    () => Promise.resolve(new Response("not json", { status: 200 })),
    async () => {
      const client = createHttpClient()
      const result = await client.request({ url: "https://example.com", method: "GET" })
      if (!result.success) throw new Error("expected request success")
      const body = await result.value.json()
      assertEquals(body.success, false)
      if (!body.success) assertEquals(body.error.tag, "NetworkError")
    },
  )
})

Deno.test("createHttpClient - returns ServerError for status >= 400", async () => {
  await withFetchStub(
    () => Promise.resolve(new Response("nope", { status: 503 })),
    async () => {
      const client = createHttpClient()
      const result = await client.request({ url: "https://example.com", method: "GET" })
      assertEquals(result.success, false)
      if (result.success) throw new Error("expected failure")
      assertEquals(result.error.tag, "ServerError")
      if (result.error.tag !== "ServerError") return
      assertEquals(result.error.status, 503)
      assertEquals(result.error.message, "nope")
    },
  )
})

Deno.test("createHttpClient - prefers x-reason header over response text on ServerError", async () => {
  await withFetchStub(
    () => Promise.resolve(new Response("body text ignored", { status: 400, headers: { "x-reason": "bad input" } })),
    async () => {
      const client = createHttpClient()
      const result = await client.request({ url: "https://example.com", method: "GET" })
      assertEquals(result.success, false)
      if (result.success || result.error.tag !== "ServerError") throw new Error("expected ServerError")
      assertEquals(result.error.message, "bad input")
    },
  )
})

Deno.test("createHttpClient - returns NetworkError when fetch throws", async () => {
  await withFetchStub(
    () => Promise.reject(new TypeError("Failed to fetch")),
    async () => {
      const client = createHttpClient()
      const result = await client.request({ url: "https://example.com", method: "GET" })
      assertEquals(result.success, false)
      if (result.success || result.error.tag !== "NetworkError") throw new Error("expected NetworkError")
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

Deno.test("createHttpClient - returned error types are construct-compatible with NetworkError / ServerError classes", () => {
  // smoke check the classes are still constructible from outside (consumer test mocks need this)
  const _net: NetworkError = new NetworkError("test")
  const _srv: ServerError = new ServerError(500, "test")
})

// A test stub that never resolves on its own — it only rejects when the request's abort signal
// fires. The signal lives on init.signal at runtime even though Deno's `RequestInit` type omits
// it from its public surface; we narrow via `in` to get at it without a type assertion.
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
    if (result.success || result.error.tag !== "NetworkError") throw new Error("expected NetworkError")
  })
})

Deno.test("createHttpClient - timeoutMs aborts the fetch when the deadline elapses", async () => {
  await withFetchStub(fetchThatAbortsOnSignal, async () => {
    const client = createHttpClient()
    const result = await client.request({ url: "https://example.com", method: "GET", timeoutMs: 10 })
    assertEquals(result.success, false)
    if (result.success || result.error.tag !== "NetworkError") throw new Error("expected NetworkError")
  })
})

Deno.test("createHttpClient - caps the error-body read at 8 KiB and uses x-reason in preference", async () => {
  const huge = "x".repeat(20 * 1024)
  await withFetchStub(
    () => Promise.resolve(new Response(huge, { status: 500 })),
    async () => {
      const client = createHttpClient()
      const result = await client.request({ url: "https://example.com", method: "GET" })
      if (result.success || result.error.tag !== "ServerError") throw new Error("expected ServerError")
      // body was 20KiB but we only slurp 8KiB into the error message.
      if (result.error.message.length > 8 * 1024) throw new Error("error body should be capped at 8KiB")
    },
  )
})

Deno.test("createHttpClient - error-body cap counts bytes, not characters (multi-byte UTF-8 cannot overshoot)", async () => {
  // Each "💩" is 4 bytes UTF-8 / 2 UTF-16 code units. 4096 of them = 16 KiB bytes / 8192 chars.
  // A char-based cap would let a 4096-emoji body slip through; the byte cap MUST cut it in half.
  const huge = "💩".repeat(4096)
  await withFetchStub(
    () => Promise.resolve(new Response(huge, { status: 500 })),
    async () => {
      const client = createHttpClient()
      const result = await client.request({ url: "https://example.com", method: "GET" })
      if (result.success || result.error.tag !== "ServerError") throw new Error("expected ServerError")
      // 8 KiB / 4 bytes-per-emoji = 2048 emojis = 4096 UTF-16 code units.
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
  const client = createHttpClient({ fetch: stub })
  const result = await client.request({ url: "https://example.com", method: "GET" })
  assertEquals(result.success, true)
  assertEquals(calls, 1)
})
