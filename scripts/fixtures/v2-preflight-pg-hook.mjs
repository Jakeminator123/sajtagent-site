import { registerHooks } from "node:module"

// Tests only: the real app Pool factory executes, but pg cannot open a socket.
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "pg") return { url: new URL("./v2-preflight-pg-stub.mjs", import.meta.url).href, shortCircuit: true }
    return nextResolve(specifier, context)
  },
})
