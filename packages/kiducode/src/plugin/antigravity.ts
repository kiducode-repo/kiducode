import type { Hooks, PluginInput } from "@opencode-ai/plugin"
import * as Log from "@opencode-ai/core/util/log"
import { OAUTH_DUMMY_KEY } from "../auth"
import { createServer } from "http"
import { InstallationVersion } from "@opencode-ai/core/installation/version"

const log = Log.create({ service: "plugin.antigravity" })

// True Antigravity OAuth2 configuration
const oAuthClientIdPart1 = "1071006060591-tmhssin2h21lcre235"
const oAuthClientIdPart2 = "vtolojh4g403ep.apps.googleusercontent.com"
const CLIENT_ID = oAuthClientIdPart1 + oAuthClientIdPart2
const oAuthClientSecretPart1 = "GOCSPX-K58FWR486"
const oAuthClientSecretPart2 = "LdLJ1mLB8sXC4z6qDAf"
const CLIENT_SECRET = oAuthClientSecretPart1 + oAuthClientSecretPart2
const AUTHORIZE_URL = "https://accounts.google.com/o/oauth2/auth"
const TOKEN_URL = "https://oauth2.googleapis.com/token"
// Google's device authorization endpoint for headless/SSH flows
const DEVICE_AUTHORIZATION_URL = "https://oauth2.googleapis.com/device/code"
const DEVICE_CODE_GRANT_TYPE = "urn:ietf:params:oauth:grant-type:device_code"
const SCOPE = "https://www.googleapis.com/auth/cloud-platform https://www.googleapis.com/auth/userinfo.email https://www.googleapis.com/auth/userinfo.profile https://www.googleapis.com/auth/cclog https://www.googleapis.com/auth/experimentsandconfigs openid"

// Device code polling parameters
const DEVICE_CODE_DEFAULT_INTERVAL_MS = 5_000
const DEVICE_CODE_MIN_INTERVAL_MS = 1_000
const DEVICE_CODE_SLOW_DOWN_INCREMENT_MS = 5_000
const DEVICE_CODE_DEFAULT_EXPIRES_MS = 5 * 60 * 1000
const OAUTH_POLLING_SAFETY_MARGIN_MS = 3_000

// Loopback OAuth server configuration
const OAUTH_HOST = "127.0.0.1"
const OAUTH_PORT = 56122
const OAUTH_REDIRECT_PATH = "/callback"
const REDIRECT_URI = `http://${OAUTH_HOST}:${OAUTH_PORT}${OAUTH_REDIRECT_PATH}`

// Refresh access token before expiry
const ACCESS_TOKEN_REFRESH_SKEW_MS = 120_000

// Antigravity API base URL
// TODO: Update with actual Antigravity API endpoint
const ANTIGRAVITY_API_BASE = "https://antigravity.google/api/v1"

interface AntigravityAuthPluginOptions {
  authorizeUrl?: string
  tokenUrl?: string
  deviceAuthorizationUrl?: string
  apiBase?: string
}

interface PkceCodes {
  verifier: string
  challenge: string
}

async function generatePKCE(): Promise<PkceCodes> {
  const verifier = generateRandomString(64)
  const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier))
  return { verifier, challenge: base64UrlEncode(hash) }
}

function generateRandomString(length: number): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~"
  return Array.from(crypto.getRandomValues(new Uint8Array(length)))
    .map((b) => chars[b % chars.length])
    .join("")
}

function base64UrlEncode(buffer: ArrayBuffer): string {
  const binary = String.fromCharCode(...new Uint8Array(buffer))
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")
}

function generateState(): string {
  return base64UrlEncode(crypto.getRandomValues(new Uint8Array(32)).buffer)
}

export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => {
    switch (char) {
      case "&":
        return "&amp;"
      case "<":
        return "&lt;"
      case ">":
        return "&gt;"
      case '"':
        return "&quot;"
      case "'":
        return "&#39;"
      default:
        return char
    }
  })
}

interface TokenResponse {
  access_token: string
  refresh_token: string
  id_token?: string
  token_type?: string
  expires_in?: number
  scope?: string
}

function authHeaders() {
  return {
    "Content-Type": "application/x-www-form-urlencoded",
    Accept: "application/json",
    "User-Agent": `kiducode/${InstallationVersion}`,
  }
}

export function accessTokenIsExpiring(
  token: string | undefined,
  skewMs: number = ACCESS_TOKEN_REFRESH_SKEW_MS,
): boolean {
  if (!token || typeof token !== "string") return false
  const parts = token.split(".")
  if (parts.length < 2) return false
  try {
    let payload = parts[1].replace(/-/g, "+").replace(/_/g, "/")
    while (payload.length % 4 !== 0) payload += "="
    const claims = JSON.parse(Buffer.from(payload, "base64").toString("utf8"))
    if (typeof claims?.exp !== "number") return false
    return claims.exp * 1000 <= Date.now() + Math.max(0, skewMs)
  } catch {
    return false
  }
}

function buildAuthorizeUrl(
  pkce: PkceCodes,
  state: string,
  nonce: string,
  options: AntigravityAuthPluginOptions = {},
): string {
  const params = new URLSearchParams({
    response_type: "code",
    client_id: CLIENT_ID,
    redirect_uri: REDIRECT_URI,
    scope: SCOPE,
    code_challenge: pkce.challenge,
    code_challenge_method: "S256",
    state,
    nonce,
    access_type: "offline",
    prompt: "consent",
  })
  return `${options.authorizeUrl ?? AUTHORIZE_URL}?${params.toString()}`
}

async function exchangeCodeForTokens(
  code: string,
  pkce: PkceCodes,
  options: AntigravityAuthPluginOptions = {},
): Promise<TokenResponse> {
  const response = await fetch(options.tokenUrl ?? TOKEN_URL, {
    method: "POST",
    headers: authHeaders(),
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: REDIRECT_URI,
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      code_verifier: pkce.verifier,
    }).toString(),
  })
  if (!response.ok) {
    const detail = await response.text().catch(() => "")
    throw new Error(`Antigravity token exchange failed (${response.status})${detail ? `: ${detail}` : ""}`)
  }
  return response.json() as Promise<TokenResponse>
}

async function refreshAccessToken(
  refreshToken: string,
  options: AntigravityAuthPluginOptions = {},
): Promise<TokenResponse> {
  const response = await fetch(options.tokenUrl ?? TOKEN_URL, {
    method: "POST",
    headers: authHeaders(),
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
    }).toString(),
  })
  if (!response.ok) {
    const detail = await response.text().catch(() => "")
    throw new Error(`Antigravity token refresh failed (${response.status})${detail ? `: ${detail}` : ""}`)
  }
  return response.json() as Promise<TokenResponse>
}

export interface DeviceCodeResponse {
  device_code: string
  user_code: string
  verification_uri: string
  verification_uri_complete?: string
  expires_in?: number
  interval?: number
}

interface DeviceTokenErrorBody {
  error?: string
  error_description?: string
}

export async function requestDeviceCode(
  options: AntigravityAuthPluginOptions = {},
): Promise<DeviceCodeResponse> {
  const response = await fetch(options.deviceAuthorizationUrl ?? DEVICE_AUTHORIZATION_URL, {
    method: "POST",
    headers: authHeaders(),
    body: new URLSearchParams({
      client_id: CLIENT_ID,
      scope: SCOPE,
    }).toString(),
  })
  if (!response.ok) {
    const detail = await response.text().catch(() => "")
    throw new Error(`Antigravity device code request failed (${response.status})${detail ? `: ${detail}` : ""}`)
  }
  const json = (await response.json()) as DeviceCodeResponse
  if (!json.device_code || !json.user_code || !json.verification_uri) {
    throw new Error("Antigravity device code response is missing device_code / user_code / verification_uri")
  }
  return json
}

function positiveSecondsToMs(value: unknown, defaultMs: number): number {
  const seconds = Number(value)
  return Number.isFinite(seconds) && seconds > 0 ? seconds * 1000 : defaultMs
}

export async function pollDeviceCodeToken(
  device: DeviceCodeResponse,
  options: AntigravityAuthPluginOptions & { sleep?: (ms: number) => Promise<void>; now?: () => number } = {},
): Promise<TokenResponse> {
  const sleep = options.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)))
  const now = options.now ?? (() => Date.now())
  const expiresInMs = positiveSecondsToMs(device.expires_in, DEVICE_CODE_DEFAULT_EXPIRES_MS)
  const deadline = now() + expiresInMs
  let intervalMs = Math.max(
    positiveSecondsToMs(device.interval, DEVICE_CODE_DEFAULT_INTERVAL_MS),
    DEVICE_CODE_MIN_INTERVAL_MS,
  )

  while (now() < deadline) {
    const response = await fetch(options.tokenUrl ?? TOKEN_URL, {
      method: "POST",
      headers: authHeaders(),
      body: new URLSearchParams({
        grant_type: DEVICE_CODE_GRANT_TYPE,
        client_id: CLIENT_ID,
        device_code: device.device_code,
      }).toString(),
    })
    if (response.ok) return (await response.json()) as TokenResponse

    const body = (await response.json().catch(() => ({}))) as DeviceTokenErrorBody
    const remaining = Math.max(0, deadline - now())
    if (body.error === "authorization_pending") {
      await sleep(Math.min(intervalMs + OAUTH_POLLING_SAFETY_MARGIN_MS, remaining))
      continue
    }
    if (body.error === "slow_down") {
      intervalMs += DEVICE_CODE_SLOW_DOWN_INCREMENT_MS
      await sleep(Math.min(intervalMs + OAUTH_POLLING_SAFETY_MARGIN_MS, remaining))
      continue
    }
    if (body.error === "access_denied" || body.error === "authorization_denied") {
      throw new Error("Antigravity device authorization was denied")
    }
    if (body.error === "expired_token") {
      throw new Error("Antigravity device code expired - please re-run login")
    }
    const detail = body.error_description ?? body.error ?? ""
    throw new Error(`Antigravity device token exchange failed (${response.status})${detail ? `: ${detail}` : ""}`)
  }
  throw new Error("Antigravity device authorization timed out")
}

const HTML_SUCCESS = `<!doctype html>
<html>
  <head>
    <title>KiduCode - Antigravity Authorization Successful</title>
    <style>
      body {
        font-family:
          system-ui,
          -apple-system,
          sans-serif;
        display: flex;
        justify-content: center;
        align-items: center;
        height: 100vh;
        margin: 0;
        background: #0d1117;
        color: #e6edf3;
      }
      .container {
        text-align: center;
        padding: 2rem;
      }
      h1 {
        color: #58a6ff;
        margin-bottom: 1rem;
      }
      p {
        color: #8b949e;
      }
      .brand {
        font-size: 0.9em;
        color: #58a6ff;
        margin-top: 1.5rem;
      }
    </style>
  </head>
  <body>
    <div class="container">
      <h1>✓ Authorization Successful</h1>
      <p>You can close this window and return to KiduCode.</p>
      <p class="brand">Powered by Google Antigravity</p>
    </div>
    <script>
      setTimeout(() => window.close(), 2000)
    </script>
  </body>
</html>`

const HTML_ERROR = (error: string) => `<!doctype html>
<html>
  <head>
    <title>KiduCode - Antigravity Authorization Failed</title>
    <style>
      body {
        font-family:
          system-ui,
          -apple-system,
          sans-serif;
        display: flex;
        justify-content: center;
        align-items: center;
        height: 100vh;
        margin: 0;
        background: #0d1117;
        color: #e6edf3;
      }
      .container {
        text-align: center;
        padding: 2rem;
      }
      h1 {
        color: #f85149;
        margin-bottom: 1rem;
      }
      p {
        color: #8b949e;
      }
      .error {
        color: #ffa198;
        font-family: monospace;
        margin-top: 1rem;
        padding: 1rem;
        background: #21262d;
        border-radius: 0.5rem;
      }
    </style>
  </head>
  <body>
    <div class="container">
      <h1>Authorization Failed</h1>
      <p>An error occurred during Antigravity authorization.</p>
      <div class="error">${escapeHtml(error)}</div>
    </div>
  </body>
</html>`

const CORS_ALLOWED_ORIGINS = new Set(["https://accounts.google.com", "https://antigravity.google"])

interface PendingOAuth {
  pkce: PkceCodes
  state: string
  resolve: (tokens: TokenResponse) => void
  reject: (error: Error) => void
}

let oauthServer: ReturnType<typeof createServer> | undefined
let pendingOAuth: PendingOAuth | undefined

async function startOAuthServer(): Promise<{ port: number; redirectUri: string }> {
  if (oauthServer) return { port: OAUTH_PORT, redirectUri: REDIRECT_URI }

  const server = createServer((req, res) => {
    const reqUrl = req.url || "/"
    const url = new URL(reqUrl, `http://${OAUTH_HOST}:${OAUTH_PORT}`)

    const origin = req.headers["origin"]
    const allowOrigin = typeof origin === "string" && CORS_ALLOWED_ORIGINS.has(origin) ? origin : ""
    if (allowOrigin) {
      res.setHeader("Access-Control-Allow-Origin", allowOrigin)
      res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS")
      res.setHeader("Access-Control-Allow-Headers", "Content-Type")
      res.setHeader("Access-Control-Allow-Private-Network", "true")
      res.setHeader("Vary", "Origin")
    }

    if (req.method === "OPTIONS") {
      res.writeHead(204)
      res.end()
      return
    }

    if (url.pathname === OAUTH_REDIRECT_PATH) {
      const code = url.searchParams.get("code")
      const state = url.searchParams.get("state")
      const error = url.searchParams.get("error")
      const errorDescription = url.searchParams.get("error_description")

      if (error) {
        const errorMsg = errorDescription || error
        pendingOAuth?.reject(new Error(errorMsg))
        pendingOAuth = undefined
        res.writeHead(200, { "Content-Type": "text/html" })
        res.end(HTML_ERROR(errorMsg))
        return
      }

      if (!code) {
        const errorMsg = "Missing authorization code"
        pendingOAuth?.reject(new Error(errorMsg))
        pendingOAuth = undefined
        res.writeHead(400, { "Content-Type": "text/html" })
        res.end(HTML_ERROR(errorMsg))
        return
      }

      if (!pendingOAuth || state !== pendingOAuth.state) {
        const errorMsg = "Invalid state - potential CSRF attack"
        pendingOAuth?.reject(new Error(errorMsg))
        pendingOAuth = undefined
        res.writeHead(400, { "Content-Type": "text/html" })
        res.end(HTML_ERROR(errorMsg))
        return
      }

      const current = pendingOAuth
      pendingOAuth = undefined

      exchangeCodeForTokens(code, current.pkce)
        .then((tokens) => current.resolve(tokens))
        .catch((err) => current.reject(err))

      res.writeHead(200, { "Content-Type": "text/html" })
      res.end(HTML_SUCCESS)
      return
    }

    if (url.pathname === "/cancel") {
      pendingOAuth?.reject(new Error("Login cancelled"))
      pendingOAuth = undefined
      res.writeHead(200)
      res.end("Login cancelled")
      return
    }

    res.writeHead(404)
    res.end("Not found")
  })

  await new Promise<void>((resolve, reject) => {
    const onError = (err: Error) => {
      oauthServer = undefined
      reject(err)
    }
    server.once("error", onError)
    server.listen(OAUTH_PORT, OAUTH_HOST, () => {
      server.removeListener("error", onError)
      server.on("error", (err) => log.warn("antigravity oauth server error", { error: err }))
      log.info("antigravity oauth server started", { host: OAUTH_HOST, port: OAUTH_PORT })
      resolve()
    })
    oauthServer = server
  })

  return { port: OAUTH_PORT, redirectUri: REDIRECT_URI }
}

function stopOAuthServer() {
  if (oauthServer) {
    oauthServer.close(() => log.info("antigravity oauth server stopped"))
    oauthServer = undefined
  }
}

function waitForOAuthCallback(pkce: PkceCodes, state: string): Promise<TokenResponse> {
  if (pendingOAuth) {
    pendingOAuth.reject(new Error("Superseded by a newer Antigravity authorize request"))
    pendingOAuth = undefined
  }
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(
      () => {
        if (pendingOAuth) {
          pendingOAuth = undefined
          reject(new Error("OAuth callback timeout - authorization took too long"))
        }
      },
      5 * 60 * 1000,
    )

    pendingOAuth = {
      pkce,
      state,
      resolve: (tokens) => {
        clearTimeout(timeout)
        resolve(tokens)
      },
      reject: (error) => {
        clearTimeout(timeout)
        reject(error)
      },
    }
  })
}

interface RefreshResult {
  access: string
  refresh: string
  expires: number
}

export async function AntigravityAuthPlugin(
  input: PluginInput,
  options: AntigravityAuthPluginOptions = {},
): Promise<Hooks> {
  return {
    auth: {
      provider: "google-antigravity",
      async loader(getAuth) {
        const auth = await getAuth()
        if (auth.type !== "oauth") return {}

        let refreshPromise: Promise<RefreshResult> | undefined

        return {
          apiKey: OAUTH_DUMMY_KEY,
          async fetch(requestInput: RequestInfo | URL, init?: RequestInit) {
            let currentAuth = await getAuth()
            if (currentAuth.type !== "oauth") return fetch(requestInput, init)

            const expiresSoon =
              !currentAuth.expires ||
              currentAuth.expires - Date.now() <= ACCESS_TOKEN_REFRESH_SKEW_MS ||
              accessTokenIsExpiring(currentAuth.access)
            if (expiresSoon) {
              if (!refreshPromise) {
                const refreshToken = currentAuth.refresh
                log.info("refreshing antigravity access token")
                refreshPromise = refreshAccessToken(refreshToken, options)
                  .then(async (tokens) => {
                    const refreshedExpires = Date.now() + (tokens.expires_in ?? 3600) * 1000
                    const refreshedRefresh = tokens.refresh_token || refreshToken
                    await input.client.auth
                      .set({
                        path: { id: "google-antigravity" },
                        body: {
                          type: "oauth",
                          access: tokens.access_token,
                          refresh: refreshedRefresh,
                          expires: refreshedExpires,
                        },
                      })
                      .catch((err) =>
                        log.warn("failed to persist refreshed antigravity tokens", { error: err }),
                      )
                    return {
                      access: tokens.access_token,
                      refresh: refreshedRefresh,
                      expires: refreshedExpires,
                    }
                  })
                  .finally(() => {
                    refreshPromise = undefined
                  })
              }
              const refreshed = await refreshPromise
              currentAuth = { ...currentAuth, ...refreshed }
            }

            const headers = new Headers(
              requestInput instanceof Request ? requestInput.headers : undefined,
            )
            if (init?.headers) {
              const entries =
                init.headers instanceof Headers
                  ? init.headers.entries()
                  : Array.isArray(init.headers)
                    ? init.headers
                    : Object.entries(init.headers as Record<string, string | undefined>)
              for (const [key, value] of entries) {
                if (value !== undefined) headers.set(key, String(value))
              }
            }
            headers.set("authorization", `Bearer ${currentAuth.access}`)
            headers.set("User-Agent", `kiducode/${InstallationVersion}`)

            const urlStr = requestInput instanceof Request ? requestInput.url : requestInput.toString()
            if (urlStr.includes("cloudcode-pa.googleapis.com")) {
              // Parse the model ID from the AI SDK URL (e.g. .../models/gemini-3.1-pro-low:stream...)
              const modelMatch = urlStr.match(/models\/([^:]+)/)
              let modelName = modelMatch ? modelMatch[1] : "gemini-3.1-pro-low"
              if (modelName.includes("gemini-3.1-pro")) modelName = "gemini-3.1-pro-low"
              else if (modelName.includes("gemini-3.5-flash")) modelName = "gemini-3.5-flash-low"
              
              // True API Endpoint doesn't have the model in the path and doesn't accept ?key= parameter
              const urlObj = new URL(urlStr.replace(/\/models\/[^:]+/, ""))
              urlObj.searchParams.delete("key")
              const actualUrl = urlObj.toString()
              // Grab the native Gemini-formatted payload from the SDK
              const bodyStr = init?.body?.toString() || "{}"
              let sdkBody = {}
              try { sdkBody = JSON.parse(bodyStr) } catch (e) {}

              // Wrap it in the Antigravity envelope
              const agPayload = {
                project: "automation-496002",
                model: modelName,
                request: sdkBody,
                userAgent: "antigravity",
                requestId: "kiducode-" + Date.now()
              }

              // Inject the mandatory Google Cloud authentication headers
              headers.set("User-Agent", "antigravity/2.0.0 windows/amd64")
              headers.set("X-Goog-Api-Client", "google-cloud-sdk vscode_cloudshelleditor/0.1")
              headers.set("Client-Metadata", JSON.stringify({ ideType: "ANTIGRAVITY", platform: "MACOS", pluginType: "GEMINI" }))
              
              // Remove the dummy API key header that ai-sdk/google injects automatically
              headers.delete("x-goog-api-key")

              log.info("Sending payload to True Gateway", { modelName, requestKeys: Object.keys(sdkBody) })

              // Forward to the True API Gateway
              const response = await fetch(actualUrl, { ...init, headers, body: JSON.stringify(agPayload) })
              
              if (!response.ok) {
                const errText = await response.text();
                log.error("True Gateway rejected request", { status: response.status, body: errText, payload: JSON.stringify(agPayload) });
                return new Response(errText, { status: response.status, headers: response.headers });
              }

              // Unwrap the {"response": ...} envelope from the streaming SSE response
              if (response.body && urlStr.includes("streamGenerateContent")) {
                let buffer = ""
                const transform = new TransformStream({
                  transform(chunk, controller) {
                    buffer += new TextDecoder().decode(chunk)
                    const lines = buffer.split(/\r?\n\r?\n/)
                    buffer = lines.pop() || "" // Keep incomplete chunk in buffer
                    for (const line of lines) {
                      if (line.startsWith("data: ")) {
                        const jsonStr = line.slice(6)
                        try {
                          const data = JSON.parse(jsonStr)
                          // Unwrap the internal 'response' so standard ai-sdk/google can parse it
                          if (data.response) {
                            if (data.response.candidates && data.response.candidates.length > 0) {
                              const content = data.response.candidates[0].content;
                              if (content && !content.role) {
                                content.role = "model";
                              }
                            }
                            const outStr = JSON.stringify(data.response)
                            log.info("Unwrapped chunk", { outStr })
                            controller.enqueue(new TextEncoder().encode(`data: ${outStr}\n\n`))
                          } else {
                            log.info("Passthrough chunk", { line })
                            controller.enqueue(new TextEncoder().encode(line + "\n\n"))
                          }
                        } catch (e) {
                          log.error("JSON parse error on chunk", { jsonStr, e })
                          controller.enqueue(new TextEncoder().encode(line + "\n\n"))
                        }
                      } else if (line.trim().length > 0) {
                        controller.enqueue(new TextEncoder().encode(line + "\n\n"))
                      }
                    }
                  },
                  flush(controller) {
                    if (buffer.trim()) controller.enqueue(new TextEncoder().encode(buffer))
                  }
                })
                return new Response(response.body.pipeThrough(transform), {
                  status: response.status,
                  statusText: response.statusText,
                  headers: response.headers
                })
              }
              return response
            }

            return fetch(requestInput, { ...init, headers })
          },
        }
      },
      methods: [
        {
          label: "Google Antigravity OAuth (Browser)",
          type: "oauth",
          authorize: async () => {
            await startOAuthServer()
            const pkce = await generatePKCE()
            const state = generateState()
            const nonce = generateState()
            const authUrl = buildAuthorizeUrl(pkce, state, nonce, options)

            const callbackPromise = waitForOAuthCallback(pkce, state)

            return {
              url: authUrl,
              instructions:
                "Complete Google Sign-In in your browser. This window will close automatically.",
              method: "auto" as const,
              callback: async () => {
                try {
                  const tokens = await callbackPromise
                  return {
                    type: "success" as const,
                    refresh: tokens.refresh_token,
                    access: tokens.access_token,
                    expires: Date.now() + (tokens.expires_in ?? 3600) * 1000,
                  }
                } catch (err) {
                  log.error("antigravity oauth callback failed", { error: err })
                  return { type: "failed" as const }
                } finally {
                  stopOAuthServer()
                }
              },
            }
          },
        },
        {
          label: "Google Antigravity OAuth (Headless / SSH)",
          type: "oauth",
          authorize: async () => {
            const device = await requestDeviceCode(options)
            const browserUrl = device.verification_uri_complete ?? device.verification_uri
            return {
              url: browserUrl,
              instructions: `Open ${device.verification_uri} on any device and enter code: ${device.user_code}`,
              method: "auto" as const,
              callback: async () => {
                try {
                  const tokens = await pollDeviceCodeToken(device, options)
                  return {
                    type: "success" as const,
                    refresh: tokens.refresh_token,
                    access: tokens.access_token,
                    expires: Date.now() + (tokens.expires_in ?? 3600) * 1000,
                  }
                } catch (err) {
                  log.error("antigravity device code callback failed", { error: err })
                  return { type: "failed" as const }
                }
              },
            }
          },
        },
        {
          label: "Manually enter API Key",
          type: "api",
        },
      ],
    },
  }
}
