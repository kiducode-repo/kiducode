import { type ComponentProps } from "solid-js"

const WORDMARK = [
  "██╗  ██╗██╗██████╗ ██╗   ██╗     ██████╗ ██████╗ ██████╗ ███████╗",
  "██║ ██╔╝██║██╔══██╗██║   ██║    ██╔════╝██╔═══██╗██╔══██╗██╔════╝",
  "█████╔╝ ██║██║  ██║██║   ██║    ██║     ██║   ██║██║  ██║█████╗  ",
  "██╔═██╗ ██║██║  ██║██║   ██║    ██║     ██║   ██║██║  ██║██╔══╝  ",
  "██║  ██╗██║██████╔╝╚██████╔╝    ╚██████╗╚██████╔╝██████╔╝███████╗",
  "╚═╝  ╚═╝╚═╝╚═════╝  ╚═════╝      ╚═════╝ ╚═════╝ ╚═════╝ ╚══════╝",
]
const BORDER_CHARS = new Set(["╗", "║", "╝", "═", "╔", "╚"])

function segments(line: string) {
  const result: Array<{ text: string; fill?: string }> = []
  let text = ""
  let fill: string | undefined

  for (const char of line) {
    const next = char === "█" ? "var(--icon-strong-base)" : BORDER_CHARS.has(char) ? "var(--icon-base)" : undefined
    if (text && next !== fill) {
      result.push({ text, fill })
      text = ""
    }
    text += char
    fill = next
  }

  if (text) result.push({ text, fill })
  return result
}

export const Mark = (props: { class?: string }) => {
  return (
    <svg
      data-component="logo-mark"
      classList={{ [props.class ?? ""]: !!props.class }}
      viewBox="0 0 16 20"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path data-slot="logo-logo-mark-shadow" d="M12 16H4V8H12V16Z" fill="var(--icon-weak-base)" />
      <path data-slot="logo-logo-mark-o" d="M12 4H4V16H12V4ZM16 20H0V0H16V20Z" fill="var(--icon-strong-base)" />
    </svg>
  )
}

export const Splash = (props: Pick<ComponentProps<"svg">, "ref" | "class">) => {
  return (
    <svg
      ref={props.ref}
      data-component="logo-splash"
      classList={{ [props.class ?? ""]: !!props.class }}
      viewBox="0 0 80 100"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path d="M60 80H20V40H60V80Z" fill="var(--icon-base)" />
      <path d="M60 20H20V80H60V20ZM80 100H0V0H80V100Z" fill="var(--icon-strong-base)" />
    </svg>
  )
}

export const Logo = (props: { class?: string }) => {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 700 88" fill="none" classList={{ [props.class ?? ""]: !!props.class }}>
      <g
        font-family="ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, Liberation Mono, monospace"
        font-size="11"
        style={{ "white-space": "pre" }}
      >
        {WORDMARK.map((line, index) => (
          <text x="0" y={11 + index * 13}>
            {segments(line).map((segment) => (
              <tspan fill={segment.fill}>{segment.text}</tspan>
            ))}
          </text>
        ))}
      </g>
    </svg>
  )
}
