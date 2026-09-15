import assert from "node:assert/strict"
import { NextRuntimeClient } from "../lib/siteagent/server/next-preview-runtime.ts"
import { sourceRevisionId, type NextJob } from "../lib/siteagent/server/next-preview-model.ts"

const originalFetch=globalThis.fetch
const files=[{path:"package.json",content:'{"dependencies":{"next":"16.3.3"}}'},{path:"app/page.jsx",content:"export default function Page(){return null}"}]
const generatedFiles=[{path:"app/layout.jsx",content:"export default function Layout({children}){return <html><body>{children}</body></html>}"},{path:"app/page.jsx",content:"export default function Page(){return <h1>Next</h1>}"}]
const job:NextJob={tenantId:"tenant:a",projectId:"project:a",jobId:"job:a",previewRef:"preview:abcdefghijklmnop",sourceRevisionId:sourceRevisionId("tenant:a","project:a",files),expiresAt:new Date(Date.now()+600000).toISOString(),status:"building"}
const output=[{path:"index.html",content:"eA==",encoding:"base64"},{path:"_next/static/app.js",content:"eA==",encoding:"base64"}]
const client=new NextRuntimeClient("https://runtime.example.com","x".repeat(32))
let checks=0
try {
  const report:Record<string,unknown>={schemaVersion:2,status:"built",tenantId:job.tenantId,projectId:job.projectId,jobId:job.jobId,previewRef:job.previewRef,sourceRevisionId:job.sourceRevisionId,sourceSnapshotSha256:job.sourceRevisionId.slice(16),workerBinding:{tenantId:job.tenantId,projectId:job.projectId,workerId:`sajtagent-v2-${"a".repeat(32)}`,isolation:"sprite"},files:output}
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
  globalThis.fetch=async ()=>new Response(null,{status:503})
  await assert.rejects(()=>client.build(job,files,new Date().toISOString()),error => error instanceof Error && error.message==="runtime_transport_5xx");checks++
  globalThis.fetch=async ()=>new Response(null,{status:404})
  await assert.rejects(()=>client.build(job,files,new Date().toISOString()),error => error instanceof Error && error.message==="runtime_transport_4xx");checks++
  globalThis.fetch=async ()=>Response.json({error:"source_generation_failed"},{status:422})
  await assert.rejects(()=>client.generate({tenantId:job.tenantId,projectId:job.projectId,prompt:"A real site",baseFiles:[]}),error => error instanceof Error && error.message==="source_generation_failed");checks++
  globalThis.fetch=async ()=>Response.json({error:"unsupported_generated_source"},{status:422})
  await assert.rejects(()=>client.generate({tenantId:job.tenantId,projectId:job.projectId,prompt:"A real site",baseFiles:[]}),error => error instanceof Error && error.message==="invalid_generated_source");checks++
  globalThis.fetch=async ()=>Response.json({error:"unsupported_package"},{status:400})
  await assert.rejects(()=>client.generate({tenantId:job.tenantId,projectId:job.projectId,prompt:"A real site",baseFiles:[]}),error => error instanceof Error && error.message==="unsupported_package");checks++
  globalThis.fetch=async ()=>Response.json({error:"invalid_package"},{status:400})
  await assert.rejects(()=>client.build(job,files,new Date().toISOString()),error => error instanceof Error && error.message==="invalid_package");checks++
  globalThis.fetch=async ()=>Response.json({error:"https://runtime.internal.example/secret"},{status:422})
  await assert.rejects(()=>client.generate({tenantId:job.tenantId,projectId:job.projectId,prompt:"A real site",baseFiles:[]}),error => error instanceof Error && error.message==="runtime_transport_4xx");checks++
  globalThis.fetch=async ()=>{throw new Error("ECONNRESET https://runtime.example.com/secret")}
  await assert.rejects(()=>client.build(job,files,new Date().toISOString()),error => error instanceof Error && error.message==="runtime_transport_failed");checks++
  globalThis.fetch=async (_input,init)=>{
    const body=JSON.parse(String(init?.body));assert.equal(body.baseFiles.length,0);assert.equal(body.prompt,"A real site");
    return Response.json({schemaVersion:2,tenantId:body.tenantId,projectId:body.projectId,jobId:body.jobId,sourceRevisionId:sourceRevisionId(body.tenantId,body.projectId,generatedFiles),files:generatedFiles})
  }
  assert.equal((await client.generate({tenantId:job.tenantId,projectId:job.projectId,prompt:"A real site",baseFiles:[]})).files.length,2);checks++
  assert.equal((await client.generate({tenantId:job.tenantId,projectId:job.projectId,prompt:"A real site",baseFiles:[]})).files.some(file=>file.path==="package.json"),false);checks++
  globalThis.fetch=async (_input,init)=>{
    const body=JSON.parse(String(init?.body))
    return Response.json({schemaVersion:2,tenantId:body.tenantId,projectId:body.projectId,jobId:body.jobId,sourceRevisionId:sourceRevisionId(body.tenantId,body.projectId,generatedFiles),files:generatedFiles,omittedBasePaths:["app/om/page.tsx"]})
  }
  assert.deepEqual((await client.generate({tenantId:job.tenantId,projectId:job.projectId,prompt:"A real site",baseFiles:[]})).omittedBasePaths,["app/om/page.tsx"]);checks++
  await assert.rejects(()=>client.generate({tenantId:job.tenantId,projectId:job.projectId,prompt:"x".repeat(19000),baseFiles:[]}),/source_context_too_large/);checks++
  await assert.rejects(()=>client.generate({tenantId:job.tenantId,projectId:job.projectId,prompt:"hero",baseFiles:[{path:"app/page.tsx",content:"x".repeat(20_000)}]}),/source_context_too_large/);checks++
  globalThis.fetch=async (_input,init)=>{
    const body=JSON.parse(String(init?.body))
    assert.ok(Array.isArray(body.retainedBasePaths))
    assert.ok(body.retainedBasePaths.includes("app/extra/page.tsx"))
    assert.equal(body.baseFiles.some((file:{path:string})=>file.path==="app/extra/page.tsx"),false)
    assert.ok(body.baseFiles.some((file:{path:string})=>file.path==="app/om/page.tsx"))
    assert.ok(JSON.stringify([body.prompt,body.baseFiles,body.retainedBasePaths]).length<=18_000)
    return Response.json({schemaVersion:2,tenantId:body.tenantId,projectId:body.projectId,jobId:body.jobId,sourceRevisionId:sourceRevisionId(body.tenantId,body.projectId,generatedFiles),files:generatedFiles})
  }
  assert.equal((await client.generate({
    tenantId:job.tenantId,projectId:job.projectId,prompt:"gör /om blå",
    baseFiles:[
      {path:"app/layout.tsx",content:"layout"},
      {path:"app/page.tsx",content:"home"},
      {path:"app/om/page.tsx",content:"om"},
      {path:"app/extra/page.tsx",content:"x".repeat(18_000)},
    ],
  })).files.length,2);checks++
  globalThis.fetch=async (_input,init)=>{const body=JSON.parse(String(init?.body));return Response.json({schemaVersion:2,tenantId:body.tenantId,projectId:"project:other",jobId:body.jobId,sourceRevisionId:job.sourceRevisionId,files})}
  await assert.rejects(()=>client.generate({tenantId:job.tenantId,projectId:job.projectId,prompt:"A real site",baseFiles:[]}),/source_binding_mismatch/);checks++
} finally {globalThis.fetch=originalFetch}
console.log(`Next runtime transport: ${checks} assertions passed (mock transport, not live worker).`)
