export * from "./client.js"
export * from "./server.js"

import { createOpencodeClient } from "./client.js"
import { createKiducodeServer } from "./server.js"
import type { ServerOptions } from "./server.js"

export * as data from "./data.js"

export async function createKiducode(options?: ServerOptions) {
  const server = await createKiducodeServer({
    ...options,
  })

  const client = createOpencodeClient({
    baseUrl: server.url,
  })

  return {
    client,
    server,
  }
}

export const createOpencode = createKiducode
