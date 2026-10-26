import { describe, expect, test } from "bun:test"
import { OauthCallbackPage } from "../src/oauth/page"

describe("OauthCallbackPage", () => {
  test("renders the embedded KiduCode logo and product copy", () => {
    const html = OauthCallbackPage.success({ provider: "Google Antigravity", autoClose: false })

    expect(html).toContain('src="data:image/png;base64,')
    expect(html).toContain('alt="KiduCode"')
    expect(html).toContain("KiduCode is now connected to Google Antigravity.")
    expect(html).toContain("Authorization successful · KiduCode")
    expect(html).not.toContain("OpenCode")
  })

  test("escapes bootstrap options embedded in the inline script", () => {
    const html = OauthCallbackPage.bootstrap({
      provider: `xAI</script><script>alert("provider")</script>`,
      tokenPath: `/token</script><script>alert("path")</script>`,
    })

    expect(html.match(/<\/script>/g)).toHaveLength(1)
    expect(html).toContain(`xAI\\u003c/script>\\u003cscript>alert(\\\"provider\\\")\\u003c/script>`)
    expect(html).toContain(`/token\\u003c/script>\\u003cscript>alert(\\\"path\\\")\\u003c/script>`)
  })
})
