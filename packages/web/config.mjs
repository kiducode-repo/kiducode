const stage = process.env.SST_STAGE || "dev"

export default {
  url: stage === "production" ? "https://kiducode.com" : `https://${stage}.kiducode.com`,
  console: stage === "production" ? "https://kiducode.com/auth" : `https://${stage}.kiducode.com/auth`,
  email: "hello@kiducode.com",
  socialCard: "https://social-cards.sst.dev",
  github: "https://github.com/kiducode/kiducode",
  discord: "https://kiducode.com/discord",
  headerLinks: [
    { name: "app.header.home", url: "/" },
    { name: "app.header.docs", url: "/docs/" },
  ],
}
