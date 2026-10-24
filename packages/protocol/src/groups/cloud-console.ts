import { Session } from "@opencode/schema/session"
import { Schema } from "effect"
import { HttpApiEndpoint, HttpApiGroup, HttpApiSchema, OpenApi } from "effect/http-api"

const Model = Schema.Struct({
  providerID: Schema.String,
  modelID: Schema.String,
  variant: Schema.optional(Schema.String),
})

const TextPart = Schema.Struct({ type: Schema.Literal("text"), text: Schema.String })
const FilePart = Schema.Struct({
  type: Schema.Literal("file"),
  url: Schema.String,
  mime: Schema.optional(Schema.String),
  filename: Schema.optional(Schema.String),
})

export const CloudConsolePrompt = Schema.Struct({
  parts: Schema.Array(Schema.Union([TextPart, FilePart])),
  model: Schema.optional(Model),
  agent: Schema.optional(Schema.String),
})

const JsonObject = Schema.Record(Schema.String, Schema.Unknown)

export const CloudConsoleGroup = HttpApiGroup.make("server.cloudConsole")
  .add(
    HttpApiEndpoint.get("cloudConsole.health", "/global/health", {
      success: Schema.Struct({ healthy: Schema.Literal(true), version: Schema.String }),
    }),
  )
  .add(
    HttpApiEndpoint.post("cloudConsole.session.create", "/session", {
      payload: Schema.Struct({ title: Schema.optional(Schema.String) }),
      success: JsonObject,
    }),
  )
  .add(
    HttpApiEndpoint.get("cloudConsole.session.messages", "/session/:sessionID/message", {
      params: { sessionID: Session.ID },
      success: Schema.Array(JsonObject),
    }),
  )
  .add(
    HttpApiEndpoint.post("cloudConsole.session.message", "/session/:sessionID/message", {
      params: { sessionID: Session.ID },
      payload: CloudConsolePrompt,
      success: JsonObject,
    }),
  )
  .add(
    HttpApiEndpoint.get("cloudConsole.session.status", "/session/status", {
      success: Schema.Record(Schema.String, JsonObject),
    }),
  )
  .add(
    HttpApiEndpoint.post("cloudConsole.session.abort", "/session/:sessionID/abort", {
      params: { sessionID: Session.ID },
      success: Schema.Boolean,
    }),
  )
  .add(
    HttpApiEndpoint.post("cloudConsole.agent.execute", "/agent/execute", {
      payload: Schema.Struct({ sessionID: Session.ID, message: CloudConsolePrompt }),
      success: JsonObject,
    }),
  )
  .add(
    HttpApiEndpoint.get("cloudConsole.event", "/event", {
      success: HttpApiSchema.StreamSse({ data: Schema.Unknown }),
    }),
  )
  .annotateMerge(
    OpenApi.annotations({
      title: "Cloud Console compatibility",
      description: "Legacy KiduCode Cloud runner routes retained during the current API migration.",
    }),
  )
