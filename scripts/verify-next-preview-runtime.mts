import assert from "node:assert/strict"
import { NextRuntimeClient } from "../lib/siteagent/server/next-preview-runtime.ts"
import { sourceRevisionId, type NextJob } from "../lib/siteagent/server/next-preview-model.ts"

const originalFetch=globalThis.fetch
const files=[{path:"package.json",content:'{"dependencies":{"next":"16.3.3"}}'},{path:"app/page.jsx",content:"export default function Page(){return null}"}]
const job:NextJob={tenantId:"tenant:a",projectId:"project:a",jobId:"job:a",previewRef:"preview:abcdefghijklmnop",sourceRevisionId:sourceRevisionId("tenant:a","project:a",files),expiresAt:new Date(Date.now()+600000).toISOString(),status:"building"}
const output=[{path:"index.html",content:"eA==",encoding:"base64"},{path:"_next/static/app.js",content:"eA==",encoding:"base64"}]
const client=new NextRuntimeClient("https://runtime.example.com","x".repeat(32))
let checks=0
try {
  let report:Record<string,unknown>={schemaVersion:2,status:"built",tenantId:job.tenantId,projectId:job.projectId,jobId:job.jobId,previewRef:job.previewRef,sourceRevisionId:job.sourceRevisionId,sourceSnapshotSha256:job.sourceRevisionId.slice(16),workerBinding:{tenantId:job.tenantId,projectId:job.projectId,workerId:`sajtagent-v2-${"a".repeat(32)}`,isolation:"sprite"},files:output}
  globalThis.fetch=async (_input,init)=>{assert.ok(new Headers(init?.headers).get("x-siteagent-signature"));return Response.json(report)}
  assert.equal((await client.build(job,files,new Date().toISOString())).length,2);checks++
  for(const key of ["jobId","projectId","tenantId","previewRef","sourceRevisionId","sourceSnapshotSha256"]){
    const old=report[key];report[key]="mismatch";await assert.rejects(()=>client.build(job,files,new Date().toISOString()));report[key]=old;checks++
  }
  const originalBinding=report.workerBinding
  report.workerBinding={tenantId:job.tenantId,projectId:job.projectId,workerId:"controller",isolation:"directory"}
  await assert.rejects(()=>client.build(job,files,new Date().toISOString()));checks++
  report.workerBinding=originalBinding
  globalThis.fetch=async ()=>Response.json({error:"no"},{status:503})
  await assert.rejects(()=>client.cancel(job),/runtime_cancel_unconfirmed/);checks++
  globalThis.fetch=async (_input,init)=>{
    const body=JSON.parse(String(init?.body));assert.equal(body.baseFiles.length,0);assert.equal(body.prompt,"A real site");
    return Response.json({schemaVersion:2,tenantId:body.tenantId,projectId:body.projectId,jobId:body.jobId,sourceRevisionId:sourceRevisionId(body.tenantId,body.projectId,files),files})
  }
  assert.equal((await client.generate({tenantId:job.tenantId,projectId:job.projectId,prompt:"A real site",baseFiles:[]})).length,2);checks++
  await assert.rejects(()=>client.generate({tenantId:job.tenantId,projectId:job.projectId,prompt:"x".repeat(19000),baseFiles:[]}),/source_context_too_large/);checks++
  globalThis.fetch=async (_input,init)=>{const body=JSON.parse(String(init?.body));return Response.json({schemaVersion:2,tenantId:body.tenantId,projectId:"project:other",jobId:body.jobId,sourceRevisionId:job.sourceRevisionId,files})}
  await assert.rejects(()=>client.generate({tenantId:job.tenantId,projectId:job.projectId,prompt:"A real site",baseFiles:[]}),/source_binding_mismatch/);checks++
} finally {globalThis.fetch=originalFetch}
console.log(`Next runtime transport: ${checks} assertions passed (mock transport, not live worker).`)
