import { define } from "@opencode/plugin/effect/plugin"
import { Model } from "@opencode/schema/model"
import { Clock, Deferred, Effect, Schema } from "effect"
import type { ServerResponse } from "node:http"
import { Credential } from "../../credential.js"
import { Integration } from "../../integration.js"
import { OauthCallbackPage } from "../../oauth/page.js"
import { Provider } from "../../provider.js"

const providerID = Provider.ID.make("google-antigravity")
const integrationID = Integration.ID.make(providerID)
const browserMethodID = Integration.MethodID.make("browser")
const headlessMethodID = Integration.MethodID.make("headless")
const clientID = "1071006060591-tmhssin2h21lcre235vtolojh4g403ep.apps.googleusercontent.com"
const clientSecret = "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"
const authorizeURL = "https://accounts.google.com/o/oauth2/auth"
const tokenURL = "https://oauth2.googleapis.com/token"
const headlessRedirect = "https://antigravity.google/oauth-callback"
const scope = [
  "https://www.googleapis.com/auth/cloud-platform",
  "https://www.googleapis.com/auth/userinfo.email",
  "https://www.googleapis.com/auth/userinfo.profile",
  "https://www.googleapis.com/auth/cclog",
  "https://www.googleapis.com/auth/experimentsandconfigs",
  "openid",
].join(" ")
const metadata = { ideType: "ANTIGRAVITY" }
const hubUserAgent = "antigravity/hub/2.24.0 (aidev_client; os_type=windows; arch=x64; cl=1000335682)"

const Token = Schema.Struct({
  access_token: Schema.NonEmptyString,
  refresh_token: Schema.optional(Schema.String),
  expires_in: Schema.optional(Schema.Number),
})
type Token = typeof Token.Type

const geminiInput = ["text", "image", "audio", "video", "pdf"]
const claudeInput = ["text", "image", "pdf"]

export const antigravityModels = [
  { id: "gemini-3.8-flash-high", name: "Gemini 3.8 Flash (High)", input: geminiInput },
  { id: "gemini-3.8-flash-medium", name: "Gemini 3.8 Flash (Medium)", input: geminiInput },
  { id: "gemini-3.8-flash-low", name: "Gemini 3.8 Flash (Low)", input: geminiInput },
  { id: "gemini-3.7-flash-medium", name: "Gemini 3.7 Flash (Medium)", input: geminiInput },
  { id: "gemini-3.7-flash-high", name: "Gemini 3.7 Flash (High)", input: geminiInput },
  { id: "gemini-3.7-flash-low", name: "Gemini 3.7 Flash (Low)", input: geminiInput },
  { id: "gemini-3.7-flash-tiered", name: "Gemini 3.7 Flash (Tiered)", input: geminiInput },
  { id: "gemini-3.6-flash-medium", name: "Gemini 3.6 Flash (Medium)", input: geminiInput },
  { id: "gemini-3.6-flash-high", name: "Gemini 3.6 Flash (High)", input: geminiInput },
  { id: "gemini-3.6-flash-low", name: "Gemini 3.6 Flash (Low)", input: geminiInput },
  { id: "gemini-3.6-flash-tiered", name: "Gemini 3.6 Flash (Tiered)", input: geminiInput },
  { id: "gemini-3.5-flash-extra-low", name: "Gemini 3.5 Flash (Extra Low)", input: geminiInput },
  { id: "gemini-3.5-flash-medium", name: "Gemini 3.5 Flash (Medium)", input: geminiInput },
  { id: "gemini-3.5-flash-high", name: "Gemini 3.5 Flash (High)", input: geminiInput },
  { id: "gemini-3.5-flash-low", name: "Gemini 3.5 Flash (Low)", input: geminiInput },
  { id: "gemini-3.1-pro-low", name: "Gemini 3.1 Pro (Low)", input: geminiInput },
  { id: "gemini-3.1-pro-high", name: "Gemini 3.1 Pro (High)", input: geminiInput },
  { id: "claude-sonnet-4-6", name: "Claude Sonnet 4.6", input: claudeInput },
  { id: "claude-opus-4-6-thinking", name: "Claude Opus 4.6 (Thinking)", input: claudeInput },
  { id: "claude-sonnet-5-5-high", name: "Claude Sonnet 5.5 (High)", input: claudeInput },
  { id: "claude-opus-5-5-high", name: "Claude Opus 5.5 (High)", input: claudeInput },
] as const

export const GoogleAntigravityPlugin = define({
  id: "kiducode.provider.google-antigravity",
  effect: Effect.fn(function* (ctx) {
    const projects = new Map<string, Promise<string>>()
    const refresh = (methodID: Integration.MethodID, value: Credential.OAuth) =>
      exchange({ grant_type: "refresh_token", refresh_token: value.refresh }).pipe(
        Effect.flatMap((token) => credential(methodID, token, value.refresh)),
      )

    yield* ctx.integration.transform((editor) => {
      editor.method.update({
        integrationID,
        method: { id: browserMethodID, type: "oauth", label: "Google Antigravity OAuth (Browser)" },
        refresh: (value) => refresh(browserMethodID, value),
        authorize: () => browserAuthorization(browserMethodID),
      })
      editor.method.update({
        integrationID,
        method: { id: headlessMethodID, type: "oauth", label: "Google Antigravity OAuth (Headless / SSH)" },
        refresh: (value) => refresh(headlessMethodID, value),
        authorize: () => headlessAuthorization(headlessMethodID),
      })
    })
    yield* ctx.provider.transform((providers) => {
      providers.add({
        info: {
          ...Provider.Info.empty(providerID),
          name: "Google Antigravity",
          integrationID,
          package: "@opencode/ai/providers/google",
          settings: {
            apiKey: "kiducode-oauth",
            baseURL: "https://cloudcode-pa.googleapis.com/v1internal",
          },
        },
        models: antigravityModels.map((model) => ({
          ...Model.Info.default(providerID, Model.ID.make(model.id)),
          name: model.name,
          package: "@opencode/ai/providers/google",
          capabilities: { tools: true, input: [...model.input], output: ["text"] },
          limit: { context: 128_000, input: 128_000, output: 4_096 },
        })),
      })
    })
    yield* ctx.session.hook(
      "http.request",
      Effect.fn(function* (event) {
        const connection = yield* ctx.integration.connection.active(integrationID)
        const value = connection ? yield* ctx.integration.connection.resolve(connection) : undefined
        if (value?.type !== "oauth") return
        const headers = new Headers(event.request.headers)
        headers.set("authorization", `Bearer ${value.access}`)
        headers.set("user-agent", hubUserAgent)
        if (!event.request.url.includes("cloudcode-pa.googleapis.com")) {
          event.request = new Request(event.request, { headers })
          return
        }
        headers.delete("x-goog-api-client")
        headers.delete("client-metadata")
        headers.delete("x-goog-user-project")
        headers.delete("x-goog-api-key")
        const accountProject = yield* project(value.access, projects)
        const url = new URL(
          event.request.url.replace("cloudcode-pa.googleapis.com", "daily-cloudcode-pa.googleapis.com"),
        )
        const match = url.pathname.match(/\/models\/([^:]+)/)
        const model = routeModel(match?.[1] ?? "gemini-3.1-pro-low")
        url.pathname = url.pathname.replace(/\/models\/[^:]+/, "")
        url.searchParams.delete("key")
        const body = yield* Effect.promise(() => event.request.clone().json()).pipe(Effect.orElseSucceed(() => ({})))
        const request = prepareRequest(body, model)
        if (url.pathname.includes("streamGenerateContent")) headers.set("accept", "text/event-stream")
        event.request = new Request(url.toString(), {
          method: event.request.method,
          headers,
          body: JSON.stringify({
            project: accountProject,
            model,
            request,
            userAgent: "antigravity",
            requestType: "agent",
            requestId: `agent-${crypto.randomUUID()}`,
          }),
          signal: event.request.signal,
        })
      }, Effect.orDie),
      { providerID },
    )
    yield* ctx.session.hook(
      "http.response",
      Effect.fn(function* (event) {
        if (!event.response.body || !event.response.headers.get("content-type")?.includes("text/event-stream")) return
        event.response = unwrap(event.response)
      }),
      { providerID },
    )
  }),
})

function browserAuthorization(methodID: Integration.MethodID) {
  return Effect.gen(function* () {
    const pkce = yield* generatePKCE
    const state = random()
    const callback = yield* Deferred.make<{ code: string; response: ServerResponse }, Error>()
    const { createServer } = yield* Effect.promise(() => import("node:http"))
    const { EventEmitter } = yield* Effect.promise(() => import("node:events"))
    const server = createServer((request, response) => {
      const url = new URL(request.url ?? "/", "http://127.0.0.1")
      if (request.method !== "GET" || url.pathname !== "/callback") {
        response.writeHead(404).end()
        return
      }
      const error =
        url.searchParams.get("state") !== state
          ? "Invalid OAuth state"
          : url.searchParams.get("error_description") ||
            url.searchParams.get("error") ||
            (!url.searchParams.get("code") ? "Missing authorization code" : undefined)
      Effect.runSync(
        error
          ? Deferred.fail(callback, new Error(error))
          : Deferred.succeed(callback, { code: url.searchParams.get("code") ?? "", response }),
      )
    })
    yield* Effect.addFinalizer(() =>
      Effect.sync(() => {
        server.close()
        server.closeAllConnections()
      }),
    )
    yield* Effect.tryPromise(() => EventEmitter.once(server.listen(0, "127.0.0.1"), "listening"))
    const address = server.address()
    if (!address || typeof address === "string") return yield* Effect.fail(new Error("Missing OAuth callback port"))
    const redirect = `http://127.0.0.1:${address.port}/callback`
    return {
      mode: "auto" as const,
      url: authorizationURL(redirect, pkce.challenge, state),
      instructions: "Complete Google Sign-In in your browser and return to KiduCode.",
      callback: Effect.gen(function* () {
        const result = yield* Deferred.await(callback)
        const respond = (error?: string) =>
          Effect.sync(() =>
            result.response
              .writeHead(error ? 400 : 200, { "Content-Type": "text/html" })
              .end(
                error
                  ? OauthCallbackPage.error(error, { provider: "Google Antigravity" })
                  : OauthCallbackPage.success({ provider: "Google Antigravity" }),
              ),
          )
        return yield* exchange({
          grant_type: "authorization_code",
          code: result.code,
          redirect_uri: redirect,
          code_verifier: pkce.verifier,
        }).pipe(
          Effect.flatMap((token) => credential(methodID, token)),
          Effect.tap(() => respond()),
          Effect.tapError((error) => respond(error instanceof Error ? error.message : "Authorization failed")),
        )
      }),
    }
  })
}

function headlessAuthorization(methodID: Integration.MethodID) {
  return Effect.gen(function* () {
    const pkce = yield* generatePKCE
    const state = random()
    return {
      mode: "code" as const,
      url: authorizationURL(headlessRedirect, pkce.challenge, state),
      instructions: "Open the URL, authenticate, then paste the provided authorization code.",
      callback: (code: string) =>
        exchange({
          grant_type: "authorization_code",
          code,
          redirect_uri: headlessRedirect,
          code_verifier: pkce.verifier,
        }).pipe(Effect.flatMap((token) => credential(methodID, token))),
    }
  })
}

function exchange(input: Record<string, string>) {
  return Effect.tryPromise({
    try: (signal) =>
      fetch(tokenURL, {
        method: "POST",
        signal,
        headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json" },
        body: new URLSearchParams({ ...input, client_id: clientID, client_secret: clientSecret }),
      }),
    catch: () => new Error("Antigravity token request failed"),
  }).pipe(
    Effect.flatMap((response) =>
      response.ok
        ? Effect.promise(() => response.json()).pipe(Effect.map(Schema.decodeUnknownSync(Token)))
        : Effect.fail(new Error(`Antigravity token request failed (${response.status})`)),
    ),
  )
}

function credential(methodID: Integration.MethodID, token: Token, currentRefresh?: string) {
  const refresh = token.refresh_token ?? currentRefresh
  if (!refresh) return Effect.fail(new Error("Antigravity token response is missing refresh_token"))
  return Clock.currentTimeMillis.pipe(
    Effect.map((now) =>
      Credential.OAuth.make({
        type: "oauth",
        methodID,
        access: token.access_token,
        refresh,
        expires: now + (token.expires_in ?? 3_600) * 1_000,
      }),
    ),
  )
}

const generatePKCE = Effect.promise(async () => {
  const verifier = random(64)
  const challenge = Buffer.from(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier))).toString(
    "base64url",
  )
  return { verifier, challenge }
})

function random(length = 32) {
  return Buffer.from(crypto.getRandomValues(new Uint8Array(length))).toString("base64url")
}

function authorizationURL(redirect: string, challenge: string, state: string) {
  return `${authorizeURL}?${new URLSearchParams({
    response_type: "code",
    client_id: clientID,
    redirect_uri: redirect,
    scope,
    code_challenge: challenge,
    code_challenge_method: "S256",
    state,
    nonce: random(),
    access_type: "offline",
    prompt: "consent",
  })}`
}

function project(access: string, cache: Map<string, Promise<string>>) {
  const existing = cache.get(access)
  if (existing) return Effect.promise(() => existing)
  const pending = fetch("https://cloudcode-pa.googleapis.com/v1internal:loadCodeAssist", {
    method: "POST",
    headers: {
      authorization: `Bearer ${access}`,
      "content-type": "application/json",
      "user-agent": hubUserAgent,
    },
    body: JSON.stringify({ metadata }),
  })
    .then(async (response) => {
      if (!response.ok) throw new Error(`Antigravity account discovery failed (${response.status})`)
      const value = (await response.json()) as { cloudaicompanionProject?: string | { id?: string } }
      const result =
        typeof value.cloudaicompanionProject === "string"
          ? value.cloudaicompanionProject
          : value.cloudaicompanionProject?.id
      if (!result) throw new Error("Antigravity did not return an account project")
      return result
    })
    .catch((error) => {
      cache.delete(access)
      throw error
    })
  cache.set(access, pending)
  return Effect.promise(() => pending)
}

export function routeModel(model: string) {
  if (model.includes("gemini-3.1-pro")) return "gemini-3.1-pro-low"
  if (model.includes("gemini-3.5-flash")) return "gemini-3.5-flash-low"
  if (model.includes("gemini-3.6-flash")) return "gemini-3.6-flash-low"
  if (model.includes("gemini-3.7-flash")) return "gemini-3.7-flash-low"
  return model
}

export function prepareRequest(input: unknown, model: string) {
  if (!input || typeof input !== "object" || Array.isArray(input)) return {}
  const request = structuredClone(input) as Record<string, unknown>
  if (!model.startsWith("gemini-3.8-flash-")) return request
  const level = model.endsWith("-high") ? "high" : model.endsWith("-medium") ? "medium" : "low"
  const generationConfig: Record<string, unknown> =
    request.generationConfig && typeof request.generationConfig === "object" && !Array.isArray(request.generationConfig)
      ? { ...request.generationConfig }
      : {}
  generationConfig.thinkingConfig = { includeThoughts: true, thinkingLevel: level }
  request.generationConfig = generationConfig
  return request
}

function unwrap(response: Response) {
  const decoder = new TextDecoder()
  const encoder = new TextEncoder()
  let buffer = ""
  const transform = new TransformStream<Uint8Array, Uint8Array>({
    transform(chunk, controller) {
      buffer += decoder.decode(chunk, { stream: true })
      const events = buffer.split(/\r?\n\r?\n/)
      buffer = events.pop() ?? ""
      for (const event of events) controller.enqueue(encoder.encode(unwrapEvent(event)))
    },
    flush(controller) {
      buffer += decoder.decode()
      if (buffer) controller.enqueue(encoder.encode(unwrapEvent(buffer)))
    },
  })
  return new Response(response.body!.pipeThrough(transform), {
    status: response.status,
    statusText: response.statusText,
    headers: response.headers,
  })
}

export function unwrapEvent(event: string) {
  const lines = event.split(/\r?\n/).map((line) => {
    if (!line.startsWith("data: ")) return line
    try {
      const value = JSON.parse(line.slice(6)) as { response?: Record<string, unknown> }
      if (!value.response) return line
      const candidates = value.response.candidates
      if (Array.isArray(candidates)) {
        const first = candidates[0] as { content?: { role?: string } } | undefined
        if (first?.content && !first.content.role) first.content.role = "model"
      }
      return `data: ${JSON.stringify(value.response)}`
    } catch {
      return line
    }
  })
  return `${lines.join("\n")}\n\n`
}
