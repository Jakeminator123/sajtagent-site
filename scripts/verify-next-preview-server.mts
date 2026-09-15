import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { shouldIdleNextPreviewPoll } from "../lib/siteagent/next-preview-poll.ts"
import { NEXT_SOURCE_FILE_CONTENT_MAX, NEXT_SOURCE_FILE_COUNT_MAX, NEXT_SOURCE_FILE_COUNT_MIN, NEXT_SOURCE_PATH_ALPHABET, NEXT_SOURCE_PATH_MAX, PREVIEW_ROUTE_LIMIT, assertPreviewSiteOrigin, canFinishJob, deriveAcceptedPreviewRoutes, gatewayHost, isNextPreviewUnavailableError, nextPreviewConfig, nextPreviewFailureStatus, outputDigest, previewBasePath, safeFilePath, sourceRevisionId, validateSourceFiles, validateStaticFiles, type NextAccepted, type NextJob, type NextState } from "../lib/siteagent/server/next-preview-model.ts"
import { applyPageOnlyMutations, applySiteNavigation, classifyExplicitPageAdds, classifyExplicitPageRemoves, classifyPageOnlyMutations, composeNextPageStub, composeSajtagentNav, executeNextPageMutation, isControllerOwnedSourcePath, listedPageRoutes, mergeGeneratedSourceFiles, modelVisibleBaseFiles, pagePathForRoute, parseManualPageRoute, planNextPageMutation, SAJTAGENT_NAV_PATH } from "../lib/siteagent/server/next-preview-pages.ts"
import { ownerAcceptedPageRoutes } from "../lib/siteagent/server/agent-build-profile.ts"
import { serveAcceptedStatic, gatewayHostnameAllowed } from "../lib/siteagent/server/next-preview-gateway.ts"

let checks=0
function check(fn:()=>void){fn();checks++}
const files=[{path:"package.json",content:'{"scripts":{"build":"next build"}}'},{path:"app/page.tsx",content:"export default function Page(){return null}"}]
const revision=sourceRevisionId("tenant:a","project:a",files)
const job:NextJob={tenantId:"tenant:a",projectId:"project:a",jobId:"job:new",sourceRevisionId:revision,previewRef:"preview:abcdefghijklmnop",status:"building",expiresAt:new Date(Date.now()+10000).toISOString()}
const state:NextState={current:job,accepted:null}
check(()=>assert.equal(canFinishJob(state,job,Date.now()),true))
for(const field of ["tenantId","projectId","jobId","sourceRevisionId","previewRef"] as const)check(()=>assert.equal(canFinishJob(state,{...job,[field]:"different"},Date.now()),false))
check(()=>assert.equal(canFinishJob({current:{...job,status:"failed"},accepted:null},job,Date.now()),false))
check(()=>assert.equal(canFinishJob({current:{...job,status:"accepted"},accepted:null},job,Date.now()),false))
check(()=>assert.equal(canFinishJob(state,job,Date.now()+20000),false))
check(()=>assert.equal(canFinishJob(state,job,Date.now()+20000,true),true))
check(()=>assert.equal(canFinishJob(state,{...job,jobId:"older"},Date.now()+20000,true),false))
// Regression A: old failure with newer failedAt must never replace current failed job.
check(()=>assert.equal(canFinishJob({current:{...job,status:"failed"},accepted:null},{...job,jobId:"job:older"},Date.now()+1),false))
check(()=>assert.equal(sourceRevisionId("tenant:a","project:a",[...files].reverse()),revision))
check(()=>assert.notEqual(sourceRevisionId("tenant:a","project:b",files),revision))
for(const path of ["../secret",".env","a/../file","/app/page.tsx","a\\b","a%2fb","node_modules/x.js"])check(()=>assert.throws(()=>validateSourceFiles([...files,{path,content:"bad"}]),/invalid_source_path/))
for(const path of ["app/page+.tsx","app/o's.tsx","app/a,b.tsx","app/a=b.tsx","app/sidé.tsx"]) {
  check(()=>assert.throws(()=>validateSourceFiles([...files,{path,content:"export default function Page(){return null}"}]),/invalid_source_path/))
}
check(()=>assert.throws(()=>validateSourceFiles([...files,files[0]])))
check(()=>assert.throws(()=>validateSourceFiles([...files,{path:"app/huge.tsx",content:"x".repeat(NEXT_SOURCE_FILE_CONTENT_MAX+1)}]),/invalid_source_file_size/))
check(()=>assert.doesNotThrow(()=>validateSourceFiles([...files,{path:"app/ok.tsx",content:"x".repeat(64)}])))
check(()=>assert.equal(NEXT_SOURCE_FILE_CONTENT_MAX,512*1024))
check(()=>assert.equal(NEXT_SOURCE_PATH_MAX,240))
check(()=>assert.equal(NEXT_SOURCE_FILE_COUNT_MIN,2))
check(()=>assert.ok(NEXT_SOURCE_FILE_COUNT_MAX<=256))
check(()=>assert.equal(NEXT_SOURCE_PATH_ALPHABET.source,"^[A-Za-z0-9_@.()[\\] /-]+$"))
const output=validateStaticFiles([{path:"index.html",content:Buffer.from("<button>0</button>").toString("base64"),encoding:"base64"},{path:"_next/static/app.js",content:Buffer.from("document.querySelector('button').onclick=()=>{};").toString("base64"),encoding:"base64"}])
check(()=>assert.equal(outputDigest(output).length,64))
check(()=>assert.throws(()=>validateStaticFiles([...output,{path:"api/evil.js",content:"eA==",encoding:"base64"}])))
check(()=>assert.throws(()=>validateStaticFiles([...output,{path:"vercel.json",content:"eA==",encoding:"base64"}])))
check(()=>assert.throws(()=>validateStaticFiles([...output,{path:".vercel/functions/evil.func/index.js",content:"eA==",encoding:"base64"}])))
const b64=(value:string)=>Buffer.from(value).toString("base64")
const exportOutsideAlphabet="_next/static/media/logo+2x.woff2"
const exportAccentPath="om-oss/café.html"
check(()=>assert.equal(NEXT_SOURCE_PATH_ALPHABET.test(exportOutsideAlphabet),false))
check(()=>assert.equal(NEXT_SOURCE_PATH_ALPHABET.test(exportAccentPath),false))
check(()=>assert.equal(safeFilePath(exportOutsideAlphabet),true))
check(()=>assert.equal(safeFilePath(exportAccentPath),true))
const nextExport=validateStaticFiles([
  {path:"index.html",content:b64("<html><body>home</body></html>"),encoding:"base64"},
  {path:"404.html",content:b64("<html>404</html>"),encoding:"base64"},
  {path:"about/index.html",content:b64("<html>about</html>"),encoding:"base64"},
  {path:"_next/static/chunks/main-0a1b2c3d.js",content:b64("export default {}"),encoding:"base64"},
  {path:"_next/static/chunks/turbopack-647f1a2b3c4d5e6f.js",content:b64("/* turbopack */"),encoding:"base64"},
  {path:"_next/static/media/geist-latin.woff2",content:b64("font"),encoding:"base64"},
  {path:exportOutsideAlphabet,content:b64("font-plus"),encoding:"base64"},
  {path:exportAccentPath,content:b64("<html>cafe</html>"),encoding:"base64"},
])
check(()=>assert.ok(nextExport.some(file=>file.path===exportOutsideAlphabet)))
check(()=>assert.ok(nextExport.some(file=>file.path===exportAccentPath)))
const acceptedExport:NextAccepted={...job,deploymentId:"dpl_export",deploymentUrl:"https://real.vercel.app",acceptedAt:new Date().toISOString(),outputSha256:outputDigest(nextExport),files:nextExport}
check(()=>assert.equal(serveAcceptedStatic(acceptedExport,["om-oss","café.html"],new Request("https://preview.example.com/"),"https://site.example.com").status,200))
check(()=>assert.equal(serveAcceptedStatic(acceptedExport,["_next","static","media","logo+2x.woff2"],new Request("https://preview.example.com/"),"https://site.example.com").status,200))
check(()=>assert.equal(serveAcceptedStatic(acceptedExport,["about"],new Request("https://preview.example.com/"),"https://site.example.com").status,200))
const aboutPages = nextExport.filter(file => file.path === "index.html" || file.path === "about/index.html" || file.path.startsWith("_next/") || file.path === "404.html")
check(()=>assert.deepEqual(deriveAcceptedPreviewRoutes(aboutPages),["/","/about"]))
check(()=>assert.deepEqual(deriveAcceptedPreviewRoutes(nextExport),["/","/about","/om-oss/café"]))
check(()=>assert.equal(deriveAcceptedPreviewRoutes([{path:"om.html"},{path:"om/index.html"},{path:"index.html"}]).join(","),"/,/om"))
check(()=>assert.equal(deriveAcceptedPreviewRoutes([{path:"om/team/index.html"},{path:"index.html"}]).join(","),"/,/om/team"))
check(()=>assert.equal(deriveAcceptedPreviewRoutes(Array.from({length:PREVIEW_ROUTE_LIMIT+2},(_,i)=>({path:i===0?"index.html":`p${i}.html`}))).length,PREVIEW_ROUTE_LIMIT))
check(()=>assert.equal(deriveAcceptedPreviewRoutes(aboutPages)[0],"/"))
const host=gatewayHost("tenant:a","project:a","preview.example.com")
check(()=>assert.equal(gatewayHostnameAllowed(host,"preview.example.com"),true))
check(()=>assert.equal(gatewayHostnameAllowed("preview.example.com.evil.test","preview.example.com"),false))
check(()=>assert.notEqual(host,gatewayHost("tenant:a","project:b","preview.example.com")))
check(()=>assert.throws(()=>gatewayHost("a","b","sajtagent-site.vercel.app")))
// Proxy reserves the whole preview zone, including its apex; Site cannot live there.
for (const origin of ["https://preview.example.com", "https://app.preview.example.com"]) {
  check(()=>assert.throws(()=>assertPreviewSiteOrigin(origin,"preview.example.com"),/invalid_site_origin/))
}
for (const origin of ["http://site.example.com", "https://site.example.com/builder"]) {
  check(()=>assert.throws(()=>assertPreviewSiteOrigin(origin,"preview.example.com"),/invalid_site_origin/))
}
check(()=>assert.doesNotThrow(()=>assertPreviewSiteOrigin("https://site.example.com","preview.example.com")))
check(()=>assert.doesNotThrow(()=>assertPreviewSiteOrigin("https://site.example.com","preview.site.example.com")))
check(()=>assert.equal(previewBasePath(job.previewRef),"/api/siteagent/next-previews/preview%3Aabcdefghijklmnop/content"))
const accepted:NextAccepted={...job,deploymentId:"dpl_real",deploymentUrl:"https://real.vercel.app",acceptedAt:new Date().toISOString(),outputSha256:outputDigest(output),files:output}
const response=serveAcceptedStatic(accepted,[],new Request("https://preview.example.com/"),"https://site.example.com")
check(()=>assert.equal(response.status,200))
check(()=>assert.equal(response.headers.get("cache-control"),"private, no-store, max-age=0"))
check(()=>assert.match(response.headers.get("content-security-policy")!,/worker-src 'none'/))
check(()=>assert.equal(response.headers.get("set-cookie"),null))
check(()=>assert.equal(serveAcceptedStatic(accepted,["index.html"],new Request("https://preview.example.com/",{headers:{"service-worker":"script"}}),"https://site.example.com").status,403))
check(()=>assert.equal(serveAcceptedStatic(accepted,["..","secret"],new Request("https://preview.example.com/"),"https://site.example.com").status,404))

const completeNextEnv = {
  SITEAGENT_NEXT_ENABLED: "true",
  SITEAGENT_NEXT_PREVIEW_DOMAIN: "preview.example.com",
  SITEAGENT_SITE_ORIGIN: "https://site.example.com",
  SITEAGENT_RUNTIME_URL: "https://runtime.example.com",
  SITEAGENT_RUNTIME_SIGNING_KEY: "k".repeat(32),
  SITEAGENT_NEXT_VERCEL_TOKEN: "token",
  SITEAGENT_NEXT_VERCEL_TEAM_ID: "team",
  SITEAGENT_NEXT_VERCEL_PROJECT_ID: "prj",
  SITEAGENT_NEXT_VERCEL_BYPASS: "bypass",
}
check(() => assert.equal(nextPreviewConfig(completeNextEnv).SITEAGENT_SITE_ORIGIN, completeNextEnv.SITEAGENT_SITE_ORIGIN))
for (const env of [
  {},
  { ...completeNextEnv, SITEAGENT_NEXT_ENABLED: "false" },
  { ...completeNextEnv, SITEAGENT_NEXT_ENABLED: "yes" },
  { ...completeNextEnv, SITEAGENT_RUNTIME_URL: "" },
  { ...completeNextEnv, SITEAGENT_SITE_ORIGIN: "https://preview.example.com" },
  { ...completeNextEnv, SITEAGENT_NEXT_PREVIEW_DOMAIN: "preview.vercel.app" },
]) {
  check(() => assert.throws(() => nextPreviewConfig(env), error => isNextPreviewUnavailableError(error)))
}
check(() => assert.equal(nextPreviewFailureStatus(new Error("next_preview_unavailable")), 404))
check(() => assert.equal(nextPreviewFailureStatus(new Error("persistence_unavailable")), 503))
check(() => assert.equal(nextPreviewFailureStatus(new Error("db_boom")), 503))
check(() => assert.equal(shouldIdleNextPreviewPoll(404), true))
check(() => assert.equal(shouldIdleNextPreviewPoll(503), false))
check(() => assert.equal(shouldIdleNextPreviewPoll(401), false))
check(() => assert.equal(shouldIdleNextPreviewPoll(200), false))

const here = dirname(fileURLToPath(import.meta.url))
const nextRoute = readFileSync(resolve(here, "../app/api/siteagent/projects/[projectId]/next/route.ts"), "utf8")
const profileRoute = readFileSync(resolve(here, "../app/api/siteagent/projects/[projectId]/next/profile/route.ts"), "utf8")
const pagesRoute = readFileSync(resolve(here, "../app/api/siteagent/projects/[projectId]/next/pages/route.ts"), "utf8")
const serviceSource = readFileSync(resolve(here, "../lib/siteagent/server/next-preview-service.ts"), "utf8")
const accessRoute = readFileSync(resolve(here, "../app/api/siteagent/projects/[projectId]/next/access/route.ts"), "utf8")
const sourceRoute = readFileSync(resolve(here, "../app/api/siteagent/projects/[projectId]/next/source/route.ts"), "utf8")
const nextProject = readFileSync(resolve(here, "../components/siteagent/use-next-project.ts"), "utf8")
check(() => assert.match(nextRoute, /nextPreviewFailureStatus\(error\)/))
check(() => assert.match(nextRoute, /nextBuildFailureResponse\(error\)/))
check(() => assert.doesNotMatch(nextRoute, /catch \{ return json\(503,\{error:"next_preview_unavailable"\}\)/))
check(() => assert.match(nextRoute, /isNextPreviewUnavailableError\(error\)\) return json\(404,\{error:"next_preview_unavailable"\}\)/))
check(() => assert.doesNotMatch(nextRoute, /json\([^)]*error\.message/))
check(() => assert.match(accessRoute, /nextAccessFailureResponse\(error\)/))
check(() => assert.match(sourceRoute, /error:"next_preview_unavailable"\},\{status:404/))
check(() => assert.match(sourceRoute, /error:"source_unavailable"\},\{status:503/))
check(() => assert.match(nextProject, /response\.status === 404/))
check(() => assert.match(nextProject, /if \(!projectId \|\| \(!state && disabledProject\.current === projectId\)\) return/))
check(() => assert.match(nextRoute, /nextPreviewOwnerReadModel/))
check(() => assert.match(profileRoute, /nextPreviewConfig\(\)/))
check(() => assert.match(profileRoute, /setProfilePreference/))
check(() => assert.match(nextProject, /setProfilePreference/))
check(() => assert.match(nextProject, /\/next\/profile/))
check(() => assert.match(nextProject, /code === "unsupported_package"/))

const basePages = [
  { path: "package.json", content: '{"dependencies":{"next":"16.3.3"}}' },
  { path: "app/layout.tsx", content: "export default function Layout({children}:{children:React.ReactNode}){return <html><body>{children}</body></html>}" },
  { path: "app/page.tsx", content: "export default function Home(){return <h1>Hem</h1>}" },
  { path: "app/om/page.tsx", content: "export default function Om(){return <h1>Om</h1>}" },
]
const generatedOnlyKontakt = [
  { path: "package.json", content: '{"dependencies":{"next":"16.3.3"}}' },
  { path: "app/layout.tsx", content: "export default function Layout({children}:{children:React.ReactNode}){return <html><body>{children}</body></html>}" },
  { path: "app/kontakt/page.tsx", content: "export default function Kontakt(){return <h1>Kontakt</h1>}" },
]
check(() => {
  const merged = mergeGeneratedSourceFiles({
    baseFiles: basePages,
    generatedFiles: generatedOnlyKontakt,
    omittedBasePaths: ["app/page.tsx", "app/om/page.tsx"],
    prompt: "Lägg till en kontaktsida",
  })
  assert.ok(merged.some(file => file.path === "app/page.tsx" && file.content.includes("Hem")))
  assert.ok(merged.some(file => file.path === "app/om/page.tsx"))
  assert.ok(merged.some(file => file.path === "app/kontakt/page.tsx"))
})
check(() => {
  const merged = mergeGeneratedSourceFiles({
    baseFiles: basePages,
    generatedFiles: generatedOnlyKontakt,
    omittedBasePaths: ["app/page.tsx", "app/om/page.tsx"],
    prompt: "Lägg till kontakt och ta bort /om",
  })
  assert.ok(merged.some(file => file.path === "app/page.tsx"))
  assert.equal(merged.some(file => file.path === "app/om/page.tsx"), false)
  assert.ok(merged.some(file => file.path === "app/kontakt/page.tsx"))
})
check(() => {
  const merged = mergeGeneratedSourceFiles({
    baseFiles: basePages,
    generatedFiles: generatedOnlyKontakt,
    prompt: "Lägg till en kontaktsida",
  })
  assert.ok(merged.some(file => file.path === "app/page.tsx"), "dropped home is restored even without omittedBasePaths")
})
check(() => {
  const merged = mergeGeneratedSourceFiles({
    baseFiles: basePages,
    generatedFiles: generatedOnlyKontakt,
    omittedBasePaths: ["app/page.tsx", "package.json", "next.config.mjs"],
    prompt: "Ny kontaktsida",
  })
  assert.equal(merged.find(file => file.path === "package.json")?.content, generatedOnlyKontakt[0].content)
  assert.ok(merged.some(file => file.path === "app/page.tsx"))
})
check(() => assert.deepEqual(classifyExplicitPageRemoves("ta bort /om", basePages), ["app/om/page.tsx"]))
check(() => assert.deepEqual(classifyExplicitPageRemoves("ta bort kontaktsidan", [...basePages, { path: "app/kontakt/page.tsx", content: "x" }]), ["app/kontakt/page.tsx"]))
check(() => assert.deepEqual(classifyExplicitPageRemoves("uppdatera kontaktsidan", [...basePages, { path: "app/kontakt/page.tsx", content: "x" }]), []))
check(() => assert.deepEqual(classifyExplicitPageRemoves("ta bort startsidan", basePages), []))
check(() => assert.deepEqual(classifyExplicitPageRemoves("ta bort sidan", basePages), []))
check(() => assert.deepEqual(classifyExplicitPageAdds("lägg till /kontakt", basePages), ["app/kontakt/page.tsx"]))
check(() => assert.deepEqual(classifyExplicitPageAdds("skapa kontaktsidan", basePages), ["app/kontakt/page.tsx"]))
check(() => assert.deepEqual(classifyExplicitPageAdds("lägg till sidan om", basePages), []))
check(() => assert.deepEqual(classifyExplicitPageAdds("lägg till sidan team", basePages), ["app/team/page.tsx"]))
check(() => assert.deepEqual(classifyExplicitPageAdds("lägg till en sida", basePages), []))
check(() => assert.deepEqual(classifyExplicitPageAdds("uppdatera /kontakt", basePages), []))
check(() => assert.deepEqual(classifyExplicitPageAdds("lägg till startsidan", basePages), []))
check(() => assert.deepEqual(classifyPageOnlyMutations("lägg till /kontakt", basePages), [{ op: "add", route: "/kontakt" }]))
check(() => assert.deepEqual(classifyPageOnlyMutations("ta bort /om", basePages), [{ op: "remove", route: "/om" }]))
check(() => assert.deepEqual(
  classifyPageOnlyMutations("lägg till /kontakt och ta bort /om", basePages),
  [{ op: "add", route: "/kontakt" }, { op: "remove", route: "/om" }],
))
check(() => assert.equal(classifyPageOnlyMutations("lägg till /kontakt och gör hero blå", basePages), null))
check(() => assert.equal(classifyPageOnlyMutations("Bygg en landningssida för ett bageri", basePages), null))
check(() => {
  const files = applyPageOnlyMutations(basePages, [
    { op: "add", route: "/kontakt" },
    { op: "remove", route: "/om" },
  ])
  assert.ok(files.some(file => file.path === "app/kontakt/page.tsx"))
  assert.equal(files.some(file => file.path === "app/om/page.tsx"), false)
  assert.match(files.find(file => file.path === SAJTAGENT_NAV_PATH)?.content ?? "", /href="\/kontakt"/)
})
check(() => {
  const generatedHomeOnly = [
    { path: "package.json", content: '{"dependencies":{"next":"16.3.3"}}' },
    { path: "app/layout.tsx", content: "export default function Layout({children}:{children:React.ReactNode}){return <html><body>{children}</body></html>}" },
    { path: "app/page.tsx", content: "export default function Home(){return <h1>Hem</h1>}" },
  ]
  const merged = mergeGeneratedSourceFiles({
    baseFiles: basePages,
    generatedFiles: generatedHomeOnly,
    omittedBasePaths: ["app/om/page.tsx"],
    prompt: "Lägg till /kontakt",
  })
  assert.ok(merged.some(file => file.path === "app/om/page.tsx"))
  const added = merged.find(file => file.path === "app/kontakt/page.tsx")
  assert.ok(added?.content.includes("<h1>Kontakt</h1>"), "prompt add inserts a stub when the model omitted the page")
})
check(() => {
  const merged = mergeGeneratedSourceFiles({
    baseFiles: basePages,
    generatedFiles: generatedOnlyKontakt,
    omittedBasePaths: ["app/page.tsx", "app/om/page.tsx"],
    prompt: "Lägg till /kontakt och ta bort /om",
  })
  assert.ok(merged.some(file => file.path === "app/kontakt/page.tsx" && file.content.includes("Kontakt")))
  assert.equal(merged.some(file => file.path === "app/om/page.tsx"), false)
})
check(() => assert.equal(isControllerOwnedSourcePath("package.json"), true))
check(() => assert.equal(isControllerOwnedSourcePath("app/page.tsx"), false))
check(() => {
  const visible = modelVisibleBaseFiles([
    ...basePages,
    { path: SAJTAGENT_NAV_PATH, content: composeSajtagentNav(["/", "/om"]) },
  ])
  assert.equal(visible.some(file => file.path === "package.json"), false)
  assert.equal(visible.some(file => file.path === SAJTAGENT_NAV_PATH), false)
  assert.ok(visible.some(file => file.path === "app/page.tsx"))
})
check(() => assert.equal(pagePathForRoute("/kontakt"), "app/kontakt/page.tsx"))
check(() => assert.equal(parseManualPageRoute("/kontakt"), "/kontakt"))
check(() => assert.equal(parseManualPageRoute("/"), "/"))
for (const route of ["/Om", "/foo_bar", "/_next", "kontakt", "//om", "/om/"]) {
  check(() => assert.throws(() => parseManualPageRoute(route), /invalid_page_route/))
}
check(() => assert.match(composeNextPageStub("/kontakt"), /<h1>Kontakt<\/h1>/))

const acceptedPages: NextAccepted = {
  ...job,
  jobId: "job:accepted",
  sourceRevisionId: sourceRevisionId("tenant:a", "project:a", basePages),
  deploymentId: "dpl_pages",
  deploymentUrl: "https://real.vercel.app",
  acceptedAt: new Date().toISOString(),
  outputSha256: "c".repeat(64),
  files: [],
}
const acceptedState: NextState = { current: null, accepted: acceptedPages }
check(() => {
  const planned = planNextPageMutation({
    state: acceptedState,
    sourceFiles: basePages,
    op: "add",
    route: "/kontakt",
    jobId: acceptedPages.jobId,
    sourceRevisionId: acceptedPages.sourceRevisionId,
  })
  assert.equal(planned.rebuild, true)
  assert.ok(planned.files.some(file => file.path === "app/kontakt/page.tsx" && file.content.includes("use client")))
  const nav = planned.files.find(file => file.path === SAJTAGENT_NAV_PATH)
  assert.match(nav?.content ?? "", /href="\/kontakt"/)
  assert.match(nav?.content ?? "", /href="\/"/)
  assert.match(planned.files.find(file => file.path === "app/layout.tsx")?.content ?? "", /SajtagentNav/)
})
check(() => {
  const planned = planNextPageMutation({
    state: acceptedState,
    sourceFiles: applySiteNavigation([...basePages, { path: "app/kontakt/page.tsx", content: composeNextPageStub("/kontakt") }]),
    op: "remove",
    route: "/om",
    jobId: acceptedPages.jobId,
    sourceRevisionId: acceptedPages.sourceRevisionId,
  })
  assert.equal(planned.rebuild, true)
  assert.equal(planned.files.some(file => file.path === "app/om/page.tsx"), false)
  assert.doesNotMatch(planned.files.find(file => file.path === SAJTAGENT_NAV_PATH)?.content ?? "", /href="\/om"/)
  assert.match(planned.files.find(file => file.path === SAJTAGENT_NAV_PATH)?.content ?? "", /href="\/kontakt"/)
})
check(() => {
  const merged = mergeGeneratedSourceFiles({
    baseFiles: basePages,
    generatedFiles: generatedOnlyKontakt,
    omittedBasePaths: ["app/page.tsx", "app/om/page.tsx"],
    prompt: "Lägg till /kontakt",
  })
  assert.match(merged.find(file => file.path === SAJTAGENT_NAV_PATH)?.content ?? "", /href="\/om"/)
  assert.match(merged.find(file => file.path === SAJTAGENT_NAV_PATH)?.content ?? "", /href="\/kontakt"/)
})
check(() => {
  assert.match(composeSajtagentNav(["/", "/om"]), /<Link href="\/om">Om<\/Link>/)
  assert.match(composeSajtagentNav(["/", "/om"]), /from "next\/link"/)
})
check(() => assert.throws(() => planNextPageMutation({
  state: acceptedState,
  sourceFiles: basePages,
  op: "remove",
  route: "/",
  jobId: acceptedPages.jobId,
  sourceRevisionId: acceptedPages.sourceRevisionId,
}), /home_page_reserved/))
check(() => assert.throws(() => planNextPageMutation({
  state: acceptedState,
  sourceFiles: basePages,
  op: "add",
  route: "/_next",
  jobId: acceptedPages.jobId,
  sourceRevisionId: acceptedPages.sourceRevisionId,
}), /invalid_page_route/))
check(() => assert.throws(() => planNextPageMutation({
  state: acceptedState,
  sourceFiles: basePages,
  op: "add",
  route: "/start",
  jobId: acceptedPages.jobId,
  sourceRevisionId: acceptedPages.sourceRevisionId,
}), /invalid_page_route/))
check(() => assert.throws(() => planNextPageMutation({
  state: acceptedState,
  sourceFiles: basePages,
  op: "add",
  route: "/home",
  jobId: acceptedPages.jobId,
  sourceRevisionId: acceptedPages.sourceRevisionId,
}), /invalid_page_route/))
check(() => assert.deepEqual(listedPageRoutes(basePages), ["/", "/om"]))
check(() => assert.deepEqual(
  ownerAcceptedPageRoutes(
    [{ path: "index.html" }, { path: "about/index.html" }],
    [...basePages, { path: "app/om/team/page.tsx", content: "export default function Team(){return <h1>Team</h1>}" }],
  ),
  ["/", "/om", "/om/team"],
))
check(() => assert.deepEqual(
  ownerAcceptedPageRoutes([{ path: "index.html" }, { path: "about/index.html" }], []),
  ["/", "/about"],
))
check(() => assert.throws(() => planNextPageMutation({
  state: acceptedState,
  sourceFiles: basePages,
  op: "add",
  route: "/kontakt",
  jobId: "job:stale",
  sourceRevisionId: acceptedPages.sourceRevisionId,
}), /accepted_revision_changed/))
check(() => assert.throws(() => planNextPageMutation({
  state: acceptedState,
  sourceFiles: basePages,
  op: "add",
  route: "/kontakt",
  jobId: acceptedPages.jobId,
  sourceRevisionId: `revision:sha256:${"d".repeat(64)}`,
}), /accepted_revision_changed/))

let builtFiles: { path: string }[] | null = null
const afterAdd = await executeNextPageMutation({
  state: acceptedState,
  sourceFiles: basePages,
  request: { op: "add", route: "/kontakt", jobId: acceptedPages.jobId, sourceRevisionId: acceptedPages.sourceRevisionId },
  build: async files => {
    builtFiles = files
    return { current: null, accepted: { ...acceptedPages, jobId: "job:built" } }
  },
})
check(() => assert.ok(builtFiles?.some(file => file.path === "app/kontakt/page.tsx")))
check(() => assert.equal(afterAdd?.accepted?.jobId, "job:built"))
check(() => assert.match(pagesRoute, /origin_denied/))
check(() => assert.match(pagesRoute, /resolveBuildPrincipalV1/))
check(() => assert.match(pagesRoute, /mutateNextPreviewPages/))
check(() => assert.match(pagesRoute, /nextPreviewOwnerReadModel/))
check(() => assert.match(pagesRoute, /getAcceptedSource/))
check(() => assert.doesNotMatch(pagesRoute, /body\.files/))
check(() => assert.match(serviceSource, /mergeGeneratedSourceFiles/))
check(() => assert.match(serviceSource, /mutateNextPreviewPages/))
check(() => assert.match(serviceSource, /mutateNextPreviewPagesFromPrompt/))
const joinSource = readFileSync(resolve(here, "../lib/siteagent/server/agent-turn-build-join.ts"), "utf8")
check(() => assert.match(joinSource, /classifyPageOnlyMutations/))
check(() => assert.match(joinSource, /pageMutations/))
check(() => assert.match(serviceSource, /buildNextPreview\(principal, projectId, files, abort, expectedAcceptedJobId/))
check(() => assert.match(serviceSource, /const generated=await runtime.generate/))
check(() => assert.match(serviceSource, /modelVisibleBaseFiles\(baseFiles\)/))
check(() => assert.match(readFileSync(resolve(here, "../lib/siteagent/server/next-preview-runtime.ts"), "utf8"), /18_000/))
check(() => assert.match(nextProject, /\/next\/pages/))
check(() => assert.match(nextProject, /mutatePages/))

console.log(`Next preview server: ${checks} assertions passed (local, not live E2E).`)
