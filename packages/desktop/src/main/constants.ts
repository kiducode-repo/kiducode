import { app } from "electron"

type Channel = "local" | "dev" | "beta" | "prod"

const raw = import.meta.env.OPENCODE_CHANNEL

export const CHANNEL: Channel = raw === "local" || raw === "dev" || raw === "beta" || raw === "prod" ? raw : "dev"

export const VERSION = app.isPackaged ? app.getVersion() : (process.env.OPENCODE_VERSION ?? app.getVersion())

const appNames: Record<string, string> = {
  dev: "KiduCode Dev",
  beta: "KiduCode Beta",
  prod: "KiduCode",
}

const appIDs: Record<string, string> = {
  dev: "com.kiducode.desktop.dev",
  beta: "com.kiducode.desktop.beta",
  prod: "com.kiducode.desktop",
}

// Local renderer/server mode keeps the dev application identity.
export const APP_NAME = app.isPackaged ? appNames[CHANNEL] : "KiduCode Dev"

export const APP_ID = app.isPackaged ? appIDs[CHANNEL] : "com.kiducode.desktop.dev"
