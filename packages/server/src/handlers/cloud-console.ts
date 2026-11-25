import { Agent } from "@opencode/schema/agent"
import { Model } from "@opencode/schema/model"
import { SessionMessage } from "@opencode/schema/session-message"
import { DateTime, Effect, Stream } from "effect"
import { HttpServerRequest, HttpServerResponse } from "effect/http"
import { HttpApiBuilder } from "effect/http-api"
import { Api } from "../api"
import { EventFeed } from "../event-feed"
import { requestRef } from "../location"
import { Session } from "@opencode/core/session"

type LegacyPrompt = {
  readonly parts: ReadonlyArray<
    | { readonly type: "text"; readonly text: string }
    | { readonly type: "file"; readonly url: string; readonly filename?: string }
  >
  readonly model?: { readonly providerID: string; readonly modelID: string; readonly variant?: string }
  readonly agent?: string
}
type JsonObject = Record<string, unknown>

export const CloudConsoleHandler = HttpApiBuilder.group(Api, "server.cloudConsole", (handlers) =>
  Effect.gen(function* () {
    const sessions = yield* Session.Service
    const feed = yield* EventFeed.Service

    const messages = (sessionID: Session.ID) =>
      sessions.messages({ sessionID, order: "asc", limit: 10_000 }).pipe(Effect.orDie)

    const execute = Effect.fn("CloudConsole.execute")(function* (sessionID: Session.ID, input: LegacyPrompt) {
      if (input.model)
        yield* sessions
          .switchModel({
            sessionID,
            model: Model.Ref.make({
              providerID: Model.Ref.fields.providerID.make(input.model.providerID),
              id: Model.ID.make(input.model.modelID),
              ...(input.model.variant ? { variant: Model.VariantID.make(input.model.variant) } : {}),
            }),
          })
          .pipe(Effect.orDie)
      if (input.agent) yield* sessions.switchAgent({ sessionID, agent: Agent.ID.make(input.agent) }).pipe(Effect.orDie)
      const admitted = yield* sessions
        .prompt({
          sessionID,
          text: input.parts
            .filter((part): part is Extract<(typeof input.parts)[number], { type: "text" }> => part.type === "text")
            .map((part) => part.text)
            .join("\n"),
          files: input.parts.flatMap((part) => (part.type === "file" ? [{ uri: part.url, name: part.filename }] : [])),
        })
        .pipe(Effect.orDie)
      yield* sessions.wait(sessionID).pipe(Effect.orDie)
      const history = yield* messages(sessionID)
      const boundary = history.findIndex((message) => message.id === admitted.id)
      const assistant = history
        .slice(boundary + 1)
        .filter((message): message is SessionMessage.Assistant => message.type === "assistant")
        .findLast((message) => message.time.completed !== undefined && message.finish !== "tool-calls")
      if (!assistant) return legacyUser(sessionID, admitted.id, input)
      return legacyAssistant(sessionID, assistant, admitted.id)
    })

    return handlers
      .handle("cloudConsole.health", () =>
        Effect.succeed({ healthy: true as const, version: process.env.OPENCODE_VERSION ?? "unknown" }),
      )
      .handle(
        "cloudConsole.session.create",
        Effect.fn(function* (ctx) {
          const request = yield* HttpServerRequest.HttpServerRequest
          const info = yield* sessions
            .create({ title: ctx.payload.title, location: requestRef(request) })
            .pipe(Effect.orDie)
          return {
            id: info.id,
            title: info.title,
            directory: info.location.directory,
            time: {
              created: DateTime.toEpochMillis(info.time.created),
              updated: DateTime.toEpochMillis(info.time.updated),
            },
          }
        }),
      )
      .handle(
        "cloudConsole.session.messages",
        Effect.fn(function* (ctx) {
          return legacyMessages(ctx.params.sessionID, yield* messages(ctx.params.sessionID))
        }),
      )
      .handle(
        "cloudConsole.session.message",
        Effect.fn(function* (ctx) {
          return yield* execute(ctx.params.sessionID, ctx.payload)
        }),
      )
      .handle(
        "cloudConsole.agent.execute",
        Effect.fn(function* (ctx) {
          return yield* execute(ctx.payload.sessionID, ctx.payload.message)
        }),
      )
      .handle(
        "cloudConsole.session.status",
        Effect.fn(function* () {
          const active = yield* sessions.active
          return Object.fromEntries(
            yield* Effect.forEach(active, (sessionID) =>
              messages(sessionID).pipe(
                Effect.map((history) => {
                  const retry = history
                    .filter((message): message is SessionMessage.Assistant => message.type === "assistant")
                    .at(-1)?.retry
                  return [
                    sessionID,
                    retry
                      ? {
                          type: "retry",
                          attempt: retry.attempt,
                          message: errorMessage(retry.error),
                          next: DateTime.toEpochMillis(retry.at),
                        }
                      : { type: "busy" },
                  ] as const
                }),
              ),
            ),
          )
        }),
      )
      .handle(
        "cloudConsole.session.abort",
        Effect.fn(function* (ctx) {
          return yield* sessions.interrupt(ctx.params.sessionID)
        }),
      )
      .handleRaw("cloudConsole.event", () =>
        Effect.gen(function* () {
          const connected = `data: ${JSON.stringify({ type: "server.connected", properties: {} })}\n\n`
          const output = Stream.unwrap(
            feed.subscribe.pipe(
              Effect.map((live) => Stream.make(connected).pipe(Stream.concat(live.pipe(Stream.map(legacyFrame))))),
            ),
          )
          const heartbeat = Stream.tick("15 seconds").pipe(Stream.map(() => ": heartbeat\n\n"))
          return HttpServerResponse.stream(
            output.pipe(Stream.merge(heartbeat, { haltStrategy: "left" }), Stream.encodeText),
            {
              contentType: "text/event-stream",
              headers: {
                "Cache-Control": "no-cache, no-transform",
                "X-Accel-Buffering": "no",
                "X-Content-Type-Options": "nosniff",
              },
            },
          )
        }),
      )
  }),
)

function legacyMessages(sessionID: Session.ID, history: readonly SessionMessage.Info[]): JsonObject[] {
  let parentID: SessionMessage.ID | undefined
  const result: JsonObject[] = []
  for (const message of history) {
    if (message.type === "user") {
      parentID = message.id
      result.push({
        info: {
          id: message.id,
          sessionID,
          role: "user",
          time: { created: DateTime.toEpochMillis(message.time.created) },
        },
        parts: [{ id: `${message.id}_0`, sessionID, messageID: message.id, type: "text", text: message.text }],
      })
      continue
    }
    if (message.type === "assistant") result.push(legacyAssistant(sessionID, message, parentID))
  }
  return result
}

function legacyUser(sessionID: Session.ID, messageID: SessionMessage.ID, input: LegacyPrompt): JsonObject {
  return {
    info: { id: messageID, sessionID, role: "user", time: { created: Date.now() } },
    parts: input.parts.map((part, index) => ({ id: `${messageID}_${index}`, sessionID, messageID, ...part })),
  }
}

function legacyAssistant(
  sessionID: Session.ID,
  message: SessionMessage.Assistant,
  parentID: SessionMessage.ID | undefined,
): JsonObject {
  return {
    info: {
      id: message.id,
      sessionID,
      role: "assistant",
      parentID,
      providerID: message.model.providerID,
      modelID: message.model.id,
      agent: message.agent,
      finish: message.finish,
      time: {
        created: DateTime.toEpochMillis(message.time.created),
        ...(message.time.completed ? { completed: DateTime.toEpochMillis(message.time.completed) } : {}),
      },
      ...(message.error ? { error: { name: message.error.type, data: { message: errorMessage(message.error) } } } : {}),
    },
    parts: message.content.map((part, index) => legacyPart(sessionID, message.id, part, index)),
  }
}

function legacyPart(
  sessionID: Session.ID,
  messageID: SessionMessage.ID,
  part: SessionMessage.AssistantContent,
  index: number,
): JsonObject {
  const base = { id: `${messageID}_${index}`, sessionID, messageID }
  if (part.type === "text" || part.type === "reasoning") return { ...base, type: part.type, text: part.text }
  const state = part.state
  if (state.status === "streaming")
    return { ...base, type: "tool", tool: part.name, callID: part.id, state: { status: "pending", input: {} } }
  if (state.status === "running") return { ...base, type: "tool", tool: part.name, callID: part.id, state }
  if (state.status === "error")
    return {
      ...base,
      type: "tool",
      tool: part.name,
      callID: part.id,
      state: { status: "error", input: state.input, error: errorMessage(state.error) },
    }
  return {
    ...base,
    type: "tool",
    tool: part.name,
    callID: part.id,
    state: {
      status: "completed",
      input: state.input,
      output: state.content
        .map((content) => (content.type === "text" ? content.text : JSON.stringify(content)))
        .join("\n"),
      metadata: state.metadata,
    },
  }
}

function errorMessage(error: { readonly message?: string; readonly type?: string }) {
  return error.message ?? error.type ?? "Unknown error"
}

function legacyFrame(frame: string) {
  if (!frame.startsWith("data: ")) return frame
  try {
    const event = JSON.parse(frame.slice(6)) as { type: string; data?: Record<string, unknown>; id?: string }
    const properties = event.data ?? {}
    return `data: ${JSON.stringify({ id: event.id, type: event.type, properties, ...properties })}\n\n`
  } catch {
    return frame
  }
}
