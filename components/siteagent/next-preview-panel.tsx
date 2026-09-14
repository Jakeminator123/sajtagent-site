"use client"

import { useEffect, useRef, useState } from "react"
import { shouldIdleNextPreviewPoll } from "../../lib/siteagent/next-preview-poll.ts"
import { NextPublicationControl } from "./next-publication-control"

type State = { current: {jobId:string;status:string;failureCode?:string}|null; accepted:{sourceRevisionId:string;previewRef:string;jobId:string}|null }

/** Opt-in first Next static-export profile; the V1 iframe remains unchanged. */
export function NextPreviewPanel({projectId}:{projectId:string|null}) {
  return <ProjectNextPreviewPanel key={projectId} projectId={projectId} />
}

function ProjectNextPreviewPanel({projectId}:{projectId:string|null}) {
  const [state,setState]=useState<State|null>(null)
  const [source,setSource]=useState("")
  const [prompt,setPrompt]=useState("")
  const [error,setError]=useState("")
  const [building,setBuilding]=useState(false)
  const [refresh,setRefresh]=useState(0)
  const opened = useRef<string|null>(null)
  const unavailable = useRef(false)
  const activeBuild = useRef<AbortController|null>(null)
  const form = useRef<HTMLFormElement>(null)
  const endpoint=projectId?`/api/siteagent/projects/${encodeURIComponent(projectId)}/next`:null

  useEffect(()=>()=>{activeBuild.current?.abort()},[])

  useEffect(()=>{
    if(!endpoint)return
    unavailable.current=false
    const abort=new AbortController()
    let timer:ReturnType<typeof setInterval>|undefined
    async function poll(){
      if(unavailable.current)return
      try {
        const response=await fetch(endpoint!,{cache:"no-store",signal:abort.signal})
        if(abort.signal.aborted || unavailable.current)return
        if(shouldIdleNextPreviewPoll(response.status)){
          unavailable.current=true
          if(timer!==undefined){clearInterval(timer);timer=undefined}
          activeBuild.current?.abort()
          activeBuild.current=null
          opened.current=null
          setState(null);setError("");setBuilding(false)
          return
        }
        if(response.ok){
          const body=await response.json()
          if(!abort.signal.aborted && !unavailable.current)setState(body.state)
        }
      }
      catch { /* Missing feature configuration intentionally leaves V1 visible. */ }
    }
    void poll()
    timer=setInterval(()=>void poll(),3000)
    return ()=>{abort.abort();if(timer!==undefined)clearInterval(timer);opened.current=null}
  },[endpoint])

  useEffect(()=>{
    const previewRef=state?.accepted?.previewRef
    if(!endpoint || !previewRef || opened.current===`${previewRef}:${refresh}`)return
    const abort=new AbortController()
    async function open(){
      try {
        const response=await fetch(`${endpoint}/access`,{method:"POST",signal:abort.signal})
        if(!response.ok)throw new Error("Previewåtkomst kunde inte bekräftas.")
        const access=await response.json()
        if(abort.signal.aborted || unavailable.current || !form.current)return
        form.current.action=access.action
        const input=form.current.elements.namedItem("grant") as HTMLInputElement
        input.value=access.grant
        opened.current=`${previewRef}:${refresh}`
        form.current.submit()
        input.value=""
      }catch(error){if(!abort.signal.aborted)setError(error instanceof Error?error.message:"Previewn kunde inte öppnas.")}
    }
    void open()
    return ()=>abort.abort()
  },[endpoint,state?.accepted?.previewRef,refresh])

  if(!endpoint || !state)return null
  async function build(fromPrompt=false){
    activeBuild.current?.abort()
    const abort=new AbortController()
    activeBuild.current=abort
    setBuilding(true);setError("")
    try {
      const parsed=fromPrompt?{prompt}:JSON.parse(source)
      const response=await fetch(endpoint!,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(parsed),signal:abort.signal})
      if(!response.ok){const body=await response.json();throw new Error(body.error==="source_context_too_large"?"Källan är för stor för denna första promptprofil. Använd källimport för vidare iteration.":"Next-bygget stoppades. Senast godkända preview behålls.")}
      const body=await response.json()
      if(!abort.signal.aborted)setState(body.state)
    }catch(error){if(!abort.signal.aborted)setError(error instanceof Error?error.message:"Bygget kunde inte startas.")}
    finally{if(activeBuild.current===abort){activeBuild.current=null;if(!abort.signal.aborted)setBuilding(false)}}
  }
  async function restore(){
    const response=await fetch(`${endpoint}/source`,{cache:"no-store"})
    if(response.ok){const body=await response.json();setSource(JSON.stringify({files:body.files},null,2))}
    else setError("Ingen accepterad Next-källa att öppna ännu.")
  }
  async function cancel(){
    activeBuild.current?.abort()
    activeBuild.current=null
    setBuilding(false)
    if(state?.current?.status!=="building")return
    const response=await fetch(endpoint!,{method:"DELETE",headers:{"content-type":"application/json"},body:JSON.stringify({jobId:state.current.jobId})})
    if(!response.ok)setError("Avbrottet kunde inte bekräftas; godkänd version ändras inte.")
  }
  return <section className="absolute inset-4 z-20 flex flex-col rounded-xl border bg-background shadow-lg" aria-label="Next.js-preview V2">
    <div className="flex flex-wrap items-center gap-2 border-b px-4 py-2 text-sm">
      <strong>Next.js · statisk export</strong>
      {projectId && <NextPublicationControl key={projectId} projectId={projectId} accepted={state.accepted} />}
      <span>{state.current?.status==="building"?"Bygger…":state.accepted?"Verifierad preview":"Redo för första Next-bygget"}</span>
      <button type="button" className="ml-auto underline" onClick={()=>void restore()}>Öppna accepterad källa</button>
      {state.accepted&&<button type="button" className="underline" onClick={()=>setRefresh(value=>value+1)}>Uppdatera preview</button>}
      {(building||state.current?.status==="building")&&<button type="button" onClick={()=>void cancel()}>Avbryt</button>}
    </div>
    <div className="flex gap-2 border-b p-3">
      <input className="min-w-0 flex-1 rounded border bg-background px-3 py-2 text-sm" value={prompt} onChange={event=>setPrompt(event.target.value)} placeholder="Beskriv din Next-sajt eller nästa ändring…" aria-label="Next-instruktion" maxLength={8000} />
      <button type="button" className="rounded border px-3 text-sm" disabled={building||!prompt.trim()} onClick={()=>void build(true)}>{building?"Arbetar…":"Bygg med Sajtagent"}</button>
    </div>
    <details className="border-b p-3 text-sm">
      <summary>Intern Next-källimport (JSON)</summary>
      <p className="my-2">Filer som {"{files:[{path,content}]}"}. Byggs i isolerad projektworker. SSR/API-rutter stöds inte i denna första profil.</p>
      <textarea className="h-32 w-full rounded border bg-background p-2 font-mono text-xs" value={source} onChange={event=>setSource(event.target.value)} aria-label="Next-källfiler" />
      <button type="button" className="rounded border px-3 py-1" disabled={building||!source} onClick={()=>void build()}>Bygg Next-preview</button>
    </details>
    {error&&<p role="alert" className="p-3 text-sm text-red-600">{error}</p>}
    <form ref={form} method="POST" target="sajtagent-next-preview" className="hidden"><input type="hidden" name="grant" /></form>
    <iframe name="sajtagent-next-preview" title="Interaktiv Next.js-preview" sandbox="allow-scripts allow-same-origin" referrerPolicy="no-referrer" className="min-h-0 flex-1 border-0 bg-white" />
  </section>
}
