import { assertEquals } from "@std/assert"
import { createHttpClient, DEFAULT_MAX_BODY_BYTES } from "../../src/infrastructure/http/fetch-http-client.ts"
import { failure } from "../../src/domain/value-object/result.ts"

const answeringWith = (response: () => Response): { fetch: typeof globalThis.fetch; calls: () => number } => {
  let calls = 0
  return {
    fetch: () => {
      calls++
      return Promise.resolve(response())
    },
    calls: () => calls,
  }
}

Deno.test("createHttpClient - asks fetch not to follow redirects", async () => {
  let redirect: RequestRedirect | undefined
  const client = createHttpClient("refuse-private", (_input, init) => {
    redirect = init?.redirect
    return Promise.resolve(new Response("ok", { status: 200 }))
  })
  await client.request({ url: "https://example.com", method: "GET" })
  assertEquals(redirect, "manual")
})

Deno.test("createHttpClient - a redirect is a ServerFailure naming where it pointed, never followed", async () => {
  const stub = answeringWith(() => new Response(null, { status: 302, headers: { location: "https://other.example/" } }))
  const result = await createHttpClient("refuse-private", stub.fetch).request({
    url: "https://example.com",
    method: "GET",
  })
  assertEquals(result, {
    success: false,
    error: { type: "server", status: 302, message: "redirect to https://other.example/ refused" },
  })
})

for (const status of [301, 302, 303, 307, 308]) {
  Deno.test(`createHttpClient - a ${status} redirect is a ServerFailure`, async () => {
    const stub = answeringWith(() => new Response(null, { status, headers: { location: "https://other.example/" } }))
    const result = await createHttpClient("refuse-private", stub.fetch).request({
      url: "https://example.com",
      method: "GET",
    })
    assertEquals(result.success ? null : result.error.type, "server")
  })
}

Deno.test("createHttpClient - a 304 Not Modified is not a redirect and succeeds with its status", async () => {
  const stub = answeringWith(() => new Response(null, { status: 304 }))
  const result = await createHttpClient("refuse-private", stub.fetch).request({
    url: "https://example.com",
    method: "GET",
  })
  assertEquals(result.success ? result.value.status : result.error, 304)
})

Deno.test("createHttpClient - a browser's opaque redirect is a ServerFailure too", async () => {
  const opaque = new Response(null, { status: 200 })
  Object.defineProperty(opaque, "type", { value: "opaqueredirect" })
  Object.defineProperty(opaque, "status", { value: 0 })
  const result = await createHttpClient("refuse-private", () => Promise.resolve(opaque)).request({
    url: "https://example.com",
    method: "GET",
  })
  assertEquals(result, { success: false, error: { type: "server", status: 0, message: "redirect refused" } })
})

const readText = async (client: ReturnType<typeof createHttpClient>, maxBodyBytes?: number): Promise<unknown> => {
  const response = await client.request({ url: "https://example.com", method: "GET", maxBodyBytes })
  if (!response.success) throw new Error("expected the request to succeed")
  return await response.value.text()
}

Deno.test("createHttpClient - reads a body of exactly the request's maxBodyBytes", async () => {
  const client = createHttpClient("refuse-private", () => Promise.resolve(new Response("abcd")))
  assertEquals(await readText(client, 4), { success: true, value: "abcd" })
})

Deno.test("createHttpClient - a body larger than the request's maxBodyBytes is a NetworkFailure", async () => {
  const body = new ReadableStream<Uint8Array>({
    start: (controller) => {
      controller.enqueue(new Uint8Array([97, 98, 99]))
      controller.enqueue(new Uint8Array([100, 101]))
      controller.close()
    },
  })
  const client = createHttpClient("refuse-private", () => Promise.resolve(new Response(body)))
  assertEquals(await readText(client, 4), {
    success: false,
    error: { type: "network", message: "response body exceeds 4 bytes" },
  })
})

Deno.test("createHttpClient - a declared content-length over maxBodyBytes fails before the body is read", async () => {
  let pulled = false
  const body = new ReadableStream<Uint8Array>({
    pull: (controller) => {
      pulled = true
      controller.close()
    },
  }, { highWaterMark: 0 })
  const client = createHttpClient(
    "refuse-private",
    () => Promise.resolve(new Response(body, { headers: { "content-length": "5" } })),
  )
  assertEquals(await readText(client, 4), {
    success: false,
    error: { type: "network", message: "response body exceeds 4 bytes" },
  })
  assertEquals(pulled, false)
})

Deno.test("createHttpClient - the body cap applies to json() and blob() as well", async () => {
  const client = createHttpClient("refuse-private", () => Promise.resolve(new Response('{"a":1}')))
  const forJson = await client.request({ url: "https://example.com", method: "GET", maxBodyBytes: 3 })
  const forBlob = await client.request({ url: "https://example.com", method: "GET", maxBodyBytes: 3 })
  if (!forJson.success || !forBlob.success) throw new Error("expected the requests to succeed")
  const json = await forJson.value.json()
  const blob = await forBlob.value.blob()
  assertEquals([json.success, blob.success], [false, false])
})

Deno.test("createHttpClient - blob() keeps the response's content type", async () => {
  const client = createHttpClient(
    "refuse-private",
    () => Promise.resolve(new Response("png", { headers: { "content-type": "image/png" } })),
  )
  const response = await client.request({ url: "https://example.com", method: "GET" })
  if (!response.success) throw new Error("expected the request to succeed")
  const blob = await response.value.blob()
  if (!blob.success) throw new Error("expected the blob to read")
  assertEquals([blob.value.type, blob.value.size], ["image/png", 3])
})

Deno.test("createHttpClient - a second body read is refused", async () => {
  const client = createHttpClient("refuse-private", () => Promise.resolve(new Response("once")))
  const response = await client.request({ url: "https://example.com", method: "GET" })
  if (!response.success) throw new Error("expected the request to succeed")
  await response.value.text()
  assertEquals(await response.value.json(), {
    success: false,
    error: { type: "network", message: "body stream already read" },
  })
})

Deno.test("createHttpClient - the default body cap is 16 MiB", () => {
  assertEquals(DEFAULT_MAX_BODY_BYTES, 16 * 1024 * 1024)
})

Deno.test("createHttpClient - a request without maxBodyBytes is capped at the default", async () => {
  const client = createHttpClient(
    "refuse-private",
    () => Promise.resolve(new Response("x", { headers: { "content-length": String(DEFAULT_MAX_BODY_BYTES + 1) } })),
  )
  assertEquals(await readText(client), {
    success: false,
    error: { type: "network", message: `response body exceeds ${DEFAULT_MAX_BODY_BYTES} bytes` },
  })
})

Deno.test("createHttpClient - a request's maxBodyBytes can lift the cap above the default", async () => {
  const client = createHttpClient(
    "refuse-private",
    () => Promise.resolve(new Response("x", { headers: { "content-length": String(DEFAULT_MAX_BODY_BYTES + 1) } })),
  )
  assertEquals(await readText(client, DEFAULT_MAX_BODY_BYTES + 1), { success: true, value: "x" })
})

const PRIVATE_TARGETS = [
  "http://127.0.0.1/",
  "http://127.1.2.3:7777/",
  "http://0x7f.1/",
  "http://0.0.0.0/",
  "http://10.0.0.1/",
  "http://100.64.0.1/",
  "http://172.16.5.4/",
  "http://192.168.1.1/",
  "http://169.254.169.254/latest/meta-data/",
  "http://[::1]/",
  "http://[::]/",
  "http://[fe80::1]/",
  "http://[fd12:3456::1]/",
  "http://[::ffff:127.0.0.1]/",
  "http://[::ffff:a9fe:a9fe]/",
  "http://[64:ff9b::7f00:1]/",
  "http://[64:ff9b::a9fe:a9fe]/",
  "http://[2002:c0a8:101::1]/",
  "http://[2002:7f00:1:2:3:4:5:6]/",
  "http://localhost:7777/",
  "http://relay.localhost/",
  "http://localhost./",
  "//127.0.0.1/templates/page.html",
]

for (const url of PRIVATE_TARGETS) {
  Deno.test(`createHttpClient - refuses the private, loopback or link-local target ${url} without fetching`, async () => {
    const stub = answeringWith(() => new Response("ok"))
    const result = await createHttpClient("refuse-private", stub.fetch).request({ url, method: "GET" })
    assertEquals([result.success, result.success ? null : result.error.type, stub.calls()], [false, "network", 0])
  })
}

const PUBLIC_TARGETS = [
  "https://example.com/",
  "https://93.184.216.34/",
  "https://172.32.0.1/",
  "https://[2606:4700::1111]/",
  "https://[64:ff9b::5db8:d822]/",
  "https://[2002:5db8:d822::1]/",
  "https://198.18.0.1/",
  "/templates/columns/feed.html",
]

for (const url of PUBLIC_TARGETS) {
  Deno.test(`createHttpClient - fetches the public or same-origin target ${url}`, async () => {
    const stub = answeringWith(() => new Response("ok"))
    const result = await createHttpClient("refuse-private", stub.fetch).request({ url, method: "GET" })
    assertEquals([result.success, stub.calls()], [true, 1])
  })
}

Deno.test("createHttpClient - names the refused host in the failure", async () => {
  const result = await createHttpClient("refuse-private", answeringWith(() => new Response("ok")).fetch).request({
    url: "http://192.168.1.1/admin",
    method: "GET",
  })
  assertEquals(result, {
    success: false,
    error: { type: "network", message: "refused a request to the private address 192.168.1.1" },
  })
})

Deno.test("createHttpClient - a client that allows private addresses reaches a local relay", async () => {
  const stub = answeringWith(() => new Response("ok"))
  const result = await createHttpClient("allow-private", stub.fetch).request({
    url: "http://localhost:7777/",
    method: "GET",
  })
  assertEquals([result.success, stub.calls()], [true, 1])
})

const redirectedTo = (url: string, body = "ok"): Response => {
  const response = new Response(body)
  Object.defineProperty(response, "redirected", { value: true })
  Object.defineProperty(response, "url", { value: url })
  return response
}

const followingFetch = (
  finalUrl: string,
): { fetch: typeof globalThis.fetch; redirect: () => RequestRedirect | undefined } => {
  let redirect: RequestRedirect | undefined
  return {
    fetch: (_input, init) => {
      redirect = init?.redirect
      return Promise.resolve(
        redirect === "follow"
          ? redirectedTo(finalUrl)
          : new Response(null, { status: 307, headers: { location: finalUrl } }),
      )
    },
    redirect: () => redirect,
  }
}

Deno.test("createHttpClient - a request with followRedirectTo asks fetch to follow redirects", async () => {
  const stub = followingFetch("https://cdn.example/blob")
  await createHttpClient("refuse-private", stub.fetch).request({
    url: "https://example.com",
    method: "GET",
    followRedirectTo: () => true,
  })
  assertEquals(stub.redirect(), "follow")
})

Deno.test("createHttpClient - a followed redirect the predicate accepts answers with the target's body", async () => {
  const seen: Array<string> = []
  const result = await createHttpClient("refuse-private", followingFetch("https://cdn.example/blob").fetch).request({
    url: "https://example.com",
    method: "GET",
    followRedirectTo: (url) => {
      seen.push(url)
      return true
    },
  })
  if (!result.success) throw new Error("expected the redirect to be followed")
  assertEquals([seen, await result.value.text()], [["https://cdn.example/blob"], { success: true, value: "ok" }])
})

Deno.test("createHttpClient - a followed redirect the predicate rejects is a NetworkFailure", async () => {
  const result = await createHttpClient("refuse-private", followingFetch("https://elsewhere.example/").fetch).request({
    url: "https://example.com",
    method: "GET",
    followRedirectTo: () => false,
  })
  assertEquals(result, {
    success: false,
    error: { type: "network", message: "redirect to https://elsewhere.example/ refused" },
  })
})

Deno.test("createHttpClient - a followed redirect that lands on a private address is refused", async () => {
  const result = await createHttpClient("refuse-private", followingFetch("http://192.168.1.1/blob").fetch).request({
    url: "https://example.com",
    method: "GET",
    followRedirectTo: () => true,
  })
  assertEquals(result, {
    success: false,
    error: { type: "network", message: "refused a request to the private address 192.168.1.1" },
  })
})

Deno.test("createHttpClient - a followed redirect may land on a private address when the client allows one", async () => {
  const result = await createHttpClient("allow-private", followingFetch("http://192.168.1.1/blob").fetch).request({
    url: "https://example.com",
    method: "GET",
    followRedirectTo: () => true,
  })
  assertEquals(result.success, true)
})

Deno.test("createHttpClient - a request without followRedirectTo still refuses the redirect", async () => {
  const stub = followingFetch("https://cdn.example/blob")
  const result = await createHttpClient("refuse-private", stub.fetch).request({
    url: "https://example.com",
    method: "GET",
  })
  assertEquals([stub.redirect(), result.success], ["manual", false])
})

const uncancellableBody = (): ReadableStream<Uint8Array> =>
  new ReadableStream<Uint8Array>({ cancel: () => Promise.reject(new TypeError("reset")) }, { highWaterMark: 0 })

const RESET = failure({ type: "network", message: "reset" } as const)

Deno.test("createHttpClient - a body that fails to cancel after an oversized content-length is a NetworkFailure", async () => {
  const response = new Response(uncancellableBody(), { headers: { "content-length": "5" } })
  const client = createHttpClient("refuse-private", () => Promise.resolve(response))
  assertEquals(await readText(client, 4), RESET)
})

Deno.test("createHttpClient - a refused redirect whose body fails to cancel is a NetworkFailure", async () => {
  const response = new Response(uncancellableBody(), { status: 302, headers: { location: "https://other.example/" } })
  const result = await createHttpClient("refuse-private", () => Promise.resolve(response)).request({
    url: "https://example.com",
    method: "GET",
  })
  assertEquals(result, RESET)
})

Deno.test("createHttpClient - a refused landing whose body fails to cancel is a NetworkFailure", async () => {
  const response = new Response(uncancellableBody())
  Object.defineProperty(response, "redirected", { value: true })
  Object.defineProperty(response, "url", { value: "https://elsewhere.example/" })
  const result = await createHttpClient("refuse-private", () => Promise.resolve(response)).request({
    url: "https://example.com",
    method: "GET",
    followRedirectTo: () => false,
  })
  assertEquals(result, RESET)
})

Deno.test("createHttpClient - refuses private addresses unless built to allow them", async () => {
  const result = await createHttpClient().request({ url: "http://127.0.0.1/", method: "GET" })
  assertEquals(result, failure({ type: "network", message: "refused a request to the private address 127.0.0.1" }))
})
