interface ImportMetaEnv {
  readonly KIDUCODE_CHANNEL: string
  readonly OPENCODE_CHANNEL: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

declare module "virtual:opencode-server" {
  export namespace Server {
    export const listen: typeof import("../../../kiducode/dist/types/src/node").Server.listen
    export type Listener = import("../../../kiducode/dist/types/src/node").Server.Listener
  }
  export namespace Config {
    export const get: typeof import("../../../kiducode/dist/types/src/node").Config.get
    export type Info = import("../../../kiducode/dist/types/src/node").Config.Info
  }
  export namespace Log {
    export const init: typeof import("../../../kiducode/dist/types/src/node").Log.init
  }
  export namespace Database {
    export const getPath: typeof import("../../../kiducode/dist/types/src/node").Database.getPath
    export const Client: typeof import("../../../kiducode/dist/types/src/node").Database.Client
  }
  export namespace JsonMigration {
    export type Progress = import("../../../kiducode/dist/types/src/node").JsonMigration.Progress
    export const run: typeof import("../../../kiducode/dist/types/src/node").JsonMigration.run
  }
  export const bootstrap: typeof import("../../../kiducode/dist/types/src/node").bootstrap
}
