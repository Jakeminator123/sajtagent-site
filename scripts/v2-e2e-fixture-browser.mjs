import { createServer } from "node:http"
import { readFile } from "node:fs/promises"
import { resolve, sep } from "node:path"
import { fixtureRoot, inspectBuiltFixture, loadPlaywright, requireThat } from "./v2-e2e-support.mjs"

export async function checkFixtureBrowser() {
  await inspectBuiltFixture()
  const root = resolve(fixtureRoot, "out")
  const server = createServer(async (request, response) => {
    try {
      const pathname = decodeURIComponent(new URL(request.url, "http://localhost").pathname)
      const path = resolve(root, `.${pathname.endsWith("/") ? `${pathname}index.html` : pathname}`)
      if (!path.startsWith(`${root}${sep}`)) { response.writeHead(403).end(); return }
      const bytes = await readFile(path)
      const type = path.endsWith(".js") ? "application/javascript" : path.endsWith(".html")
        ? "text/html" : path.endsWith(".css") ? "text/css" : "application/octet-stream"
      response.writeHead(200, { "content-type": type, "cache-control": "no-store" }).end(bytes)
    } catch { response.writeHead(404).end() }
  })
  await new Promise((resolve, reject) => {
    server.once("error", reject)
    server.listen(0, "127.0.0.1", resolve)
  })
  let browser
  try {
    const chromium = await loadPlaywright()
    browser = await chromium.launch({ headless: true })
    const page = await browser.newPage()
    const errors = []
    page.on("pageerror", () => errors.push("page_error"))
    await page.goto(`http://127.0.0.1:${server.address().port}/`)
    await page.getByTestId("revision").filter({ hasText: "revision ONE" }).waitFor()
    await page.getByTestId("counter").click()
    await page.waitForFunction(() => document.querySelector('[data-testid="counter"]')?.textContent?.trim() === "Count: 1")
    requireThat(errors.length === 0, "fixture_browser_runtime_errors")
  } finally {
    if (browser) await browser.close()
    server.closeAllConnections()
    await new Promise((resolve) => server.close(resolve))
  }
}
