import { For, type ComponentProps } from "solid-js"
import { glyphs, letters } from "../typography/wordmark/glyphs"

export { glyphs, letters } from "../typography/wordmark/glyphs"

export const Mark = (props: { class?: string }) => {
  return (
    <svg
      data-component="logo-mark"
      classList={{ [props.class ?? ""]: !!props.class }}
      viewBox="0 0 16 20"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path d={glyphs.K.shade} transform="scale(.65 .55)" fill="var(--icon-weak-base)" />
      <path d={glyphs.K.face} transform="scale(.65 .55)" fill="var(--icon-strong-base)" />
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
      <g transform="scale(3.25 2.75)">
        <path d={glyphs.K.shade} fill="var(--icon-base)" />
        <path d={glyphs.K.face} fill="var(--icon-strong-base)" />
      </g>
    </svg>
  )
}

export const Logo = (props: { class?: string }) => {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 234 42"
      fill="none"
      classList={{ [props.class ?? ""]: !!props.class }}
    >
      <For each={letters}>
        {(letter, index) => (
          <g transform={`translate(${index() * 30} 3)`}>
            <path d={glyphs[letter].shade} fill="var(--icon-weak-base)" />
            <path d={glyphs[letter].face} fill={index() < 4 ? "var(--icon-base)" : "var(--icon-strong-base)"} />
          </g>
        )}
      </For>
    </svg>
  )
}
