import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { shouldIdleNextPreviewPoll } from "../lib/siteagent/next-preview-poll.ts"
import { NEXT_SOURCE_FILE_CONTENT_MAX, NEXT_SOURCE_FILE_COUNT_MAX, NEXT_SOURCE_FILE_COUNT_MIN, NEXT_SOURCE_PATH_ALPHABET, NEXT_SOURCE_PATH_MAX, assertPreviewSiteOrigin, canFinishJob, gatewayHost, isNextPreviewUnavailableError, nextPreviewConfig, nextPreviewFailureStatus, outputDigest, previewBasePath, sourceRevisionId, validateSourceFiles, validateStaticFiles, type NextAccepted, type NextJob, type NextState } from "../lib/siteagent/server/next-preview-model.ts"
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

console.log(`Next preview server: ${checks} assertions passed (local, not live E2E).`)
