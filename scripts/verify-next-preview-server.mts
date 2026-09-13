import assert from "node:assert/strict"
import { canFinishJob, gatewayHost, outputDigest, previewBasePath, sourceRevisionId, validateSourceFiles, validateStaticFiles, type NextAccepted, type NextJob, type NextState } from "../lib/siteagent/server/next-preview-model.ts"
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
// Regression A: old failure with newer failedAt must never replace current failed job.
check(()=>assert.equal(canFinishJob({current:{...job,status:"failed"},accepted:null},{...job,jobId:"job:older"},Date.now()+1),false))
check(()=>assert.equal(sourceRevisionId("tenant:a","project:a",[...files].reverse()),revision))
check(()=>assert.notEqual(sourceRevisionId("tenant:a","project:b",files),revision))
for(const path of ["../secret",".env","a/../file","/app/page.tsx","a\\b","a%2fb","node_modules/x.js"])check(()=>assert.throws(()=>validateSourceFiles([...files,{path,content:"bad"}])))
check(()=>assert.throws(()=>validateSourceFiles([...files,files[0]])))
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
check(()=>assert.equal(previewBasePath(job.previewRef),"/api/siteagent/next-previews/preview%3Aabcdefghijklmnop/content"))
const accepted:NextAccepted={...job,deploymentId:"dpl_real",deploymentUrl:"https://real.vercel.app",acceptedAt:new Date().toISOString(),outputSha256:outputDigest(output),files:output}
const response=serveAcceptedStatic(accepted,[],new Request("https://preview.example.com/"),"https://site.example.com")
check(()=>assert.equal(response.status,200))
check(()=>assert.equal(response.headers.get("cache-control"),"private, no-store, max-age=0"))
check(()=>assert.match(response.headers.get("content-security-policy")!,/worker-src 'none'/))
check(()=>assert.equal(response.headers.get("set-cookie"),null))
check(()=>assert.equal(serveAcceptedStatic(accepted,["index.html"],new Request("https://preview.example.com/",{headers:{"service-worker":"script"}}),"https://site.example.com").status,403))
check(()=>assert.equal(serveAcceptedStatic(accepted,["..","secret"],new Request("https://preview.example.com/"),"https://site.example.com").status,404))
console.log(`Next preview server: ${checks} assertions passed (local, not live E2E).`)
