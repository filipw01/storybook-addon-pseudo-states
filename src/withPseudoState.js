import { addons, useArgs, useEffect, useGlobals, useMemo } from "@storybook/addons"
import { STORY_RENDERED } from "@storybook/core-events"

import { PSEUDO_STATES } from "./constants"

const pseudoStates = Object.values(PSEUDO_STATES)
const matchOne = new RegExp(`:(${pseudoStates.join("|")})`)
const matchAll = new RegExp(`:(${pseudoStates.join("|")})`, "g")

// Rewrite CSS rules for pseudo-states on all stylesheets to add an alternative selector
function initPseudoStyles(shadowRoot) {
  for (const sheet of (shadowRoot || document).styleSheets) {
    try {
      let index = 0
      for (const { cssText, selectorText } of sheet.cssRules) {
        if (matchOne.test(selectorText)) {
          const newRule = cssText.replace(
            selectorText,
            selectorText
              .split(", ")
              .flatMap((selector) => {
                if (selector.includes(`.pseudo-`)) return []
                const states = []
                const plainSelector = selector.replace(matchAll, (_, state) => {
                  states.push(`.pseudo-${state}`)
                  return ""
                })
                const stateSelector = shadowRoot
                  ? `:host-context(${states.join("")}) ${plainSelector}`
                  : `${states.join("")} ${plainSelector}`
                return [selector, stateSelector]
              })
              .join(", ")
          )
          sheet.deleteRule(index)
          sheet.insertRule(newRule, index)
        }
        index++
      }
    } catch (e) {
      if (e.toString().includes("cssRules")) {
        // eslint-disable-next-line no-console
        console.warn("Can't access cssRules, most likely due to CORS restrictions", sheet.href)
      } else {
        // eslint-disable-next-line no-console
        console.error(e, sheet.href)
      }
    }
  }
}

// Reinitialize CSS enhancements every time the story changes
addons.getChannel().on(STORY_RENDERED, () => initPseudoStyles())

// Monkeypatch the attachShadow method so we can handle pseudo styles inside shadow DOM
Element.prototype._attachShadow = Element.prototype.attachShadow
Element.prototype.attachShadow = function attachShadow(init) {
  const shadowRoot = this._attachShadow({ ...init, mode: "open" })
  setTimeout(() => initPseudoStyles(shadowRoot))
  return shadowRoot
}

export const withPseudoState = (StoryFn) => {
  const [{ pseudo: args }] = useArgs()
  const [{ pseudo: globals }, updateGlobals] = useGlobals()

  // Sync args to globals, used by the toolbar
  useEffect(() => {
    if (args !== globals) updateGlobals({ pseudo: args })
  }, [args])

  // Convert selected pseudo states to CSS classnames
  const pseudoStateClassNames = useMemo(() => {
    if (!globals) return []
    return Object.entries(globals)
      .filter(([_, value]) => value)
      .map(([key]) => `pseudo-${PSEUDO_STATES[key]}`)
  }, [globals])

  const root = document.getElementById("root")

  // Drop any existing pseudo state classnames that carried over from a previously viewed story
  // before adding the new classnames. We do this the old-fashioned way, for IE compatibility.
  root.className = root.className
    .split(" ")
    .filter((classname) => classname && classname.indexOf("pseudo-") !== 0)
    .concat(pseudoStateClassNames)
    .join(" ")

  return StoryFn()
}
