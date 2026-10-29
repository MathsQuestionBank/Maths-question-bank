import {lazy,Suspense,useEffect,useState} from "react";
const PaperExtractionReview=lazy(()=>import("./PaperExtractionReview"));
import PaperCoverage from "./PaperCoverage";
import type {StagedPaper} from "./paperCoverage";
import {supabase} from "./supabase";

const BUCKET="exam-materials-private";
type Staged=StagedPaper;
type Folder={name:string;id:string|null};
async function listFolder(prefix:string):Promise<Folder[]>{
 const all:Folder[]=[];
 for(let offset=0;;offset+=100){
 const {data,error}=await supabase.storage.from(BUCKET).list(prefix,{limit:100,offset,sortBy:{column:"name",order:"asc"}});
 if(error)throw new Error(error.message);
 all.push(...(data||[]).map(x=>({name:x.name,id:x.id})));
 if(!data||data.length<100)return all;
 }
}
export default function StagedPaperReview({onPublished,refreshKey=0}:{onPublished?:()=>void;refreshKey?:number}){
 const [revision,setRevision]=useState(0),[archiveError,setArchiveError]=useState("");
 const [papers,setPapers]=useState<Staged[]>([]);
 const [loading,setLoading]=useState(false);
 const [message,setMessage]=useState("");
 const [opening,setOpening]=useState("");
 const [selectedPath,setSelectedPath]=useState("");
 const refresh=async()=>{
  setLoading(true);setMessage("");setArchiveError("");
  try{
   const {data:{user},error:authError}=await supabase.auth.getUser();
   const {data:owner,error:roleError}=await supabase.rpc("is_approved_owner");
   if(authError||!user||roleError||owner!==true)throw new Error("Sign in as an approved owner to review staged files.");
   const found:Staged[]=[];
   for(const board of await listFolder("new-paper-intake")){
    if(board.id)continue;
    for(const qualification of await listFolder("new-paper-intake/"+board.name)){
     if(qualification.id)continue;
     for(const series of await listFolder("new-paper-intake/"+board.name+"/"+qualification.name)){
      if(series.id)continue;
      for(const paper of await listFolder("new-paper-intake/"+board.name+"/"+qualification.name+"/"+series.name)){
       if(paper.id)continue;
       const root=["new-paper-intake",board.name,qualification.name,series.name,paper.name].join("/");
       const items=await listFolder(root+"/"+user.id);
       if(items.length===0)continue;
       found.push({path:root+"/"+user.id,board:board.name,qualification:qualification.name,series:series.name,code:paper.name,question:items.some(x=>x.name==="question-paper.pdf"),mark:items.some(x=>x.name==="mark-scheme.pdf"),manifest:items.some(x=>x.name==="intake.json"),reviewSaved:items.some(x=>x.name==="extraction-review.json")});
      }
     }
    }
   }
   for(const paper of found){
    if(!paper.reviewSaved)continue;
    try{
     const {data,error}=await supabase.storage.from(BUCKET).download(paper.path+"/extraction-review.json",{cacheNonce:crypto.randomUUID()},{cache:"no-store"});
     if(error||!data)throw Error(error?.message||"Saved review unavailable");
     const saved=JSON.parse(await data.text());
     if(saved.version!==1||!Array.isArray(saved.items)||!saved.items.length||new Set(saved.items.map((x:{number:number})=>x.number)).size!==saved.items.length)throw Error("Saved review is invalid; original file retained");
     paper.review={questions:saved.items.length,approved:saved.items.filter((x:{approved:boolean})=>x.approved===true).length};
    }catch(e){paper.reviewError=e instanceof Error?e.message:"Cannot read saved review"}
   }
   setPapers(found);setMessage(found.length?"These are archived source files, not extracted or published questions.":"No staged exam papers found for your account.");
  }catch(e){const text=e instanceof Error?e.message:"Unable to load the staging archive.";setMessage(text);setArchiveError(text)}
  finally{setLoading(false);setRevision(n=>n+1)}
 };
 useEffect(()=>{void refresh()},[refreshKey]);
 const open=async(path:string,filename:string)=>{
  setOpening(path+"/"+filename);
  try{
   const {data,error}=await supabase.storage.from(BUCKET).createSignedUrl(path+"/"+filename,120);
   if(error||!data?.signedUrl)throw new Error(error?.message||"Could not create a private viewing link.");
   window.open(data.signedUrl,"_blank","noopener,noreferrer");
  }catch(e){setMessage(e instanceof Error?e.message:"Unable to open file.")}
  finally{setOpening("")}
 };
 return <section className="panel" style={{padding:22}}>
 <div className="row" style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:12,flexWrap:"wrap"}}>
 <div><h2>Review Imported Papers</h2><p className="hint">Inspect archived PDFs and prepare suggested question and mark-scheme crops for approval.</p></div>
 <button className="secondary small" disabled={loading} onClick={()=>void refresh()}>{loading?"Checking…":"Refresh list"}</button>
 </div>
 <PaperCoverage staged={papers} onOpen={setSelectedPath} revision={revision} archiveError={loading?"Archive scan in progress":archiveError}/>
 {message&&<p role="status">{message}</p>}
 {papers.map(p=><div key={p.path}><div className="saved-item">
 <div><strong>{p.board} · {p.series} · {p.code}</strong><p>{p.qualification} · {p.code.endsWith("F")?"Foundation":"Higher"} · {p.question&&p.mark?"Both PDFs archived":"Missing source file"} · {p.reviewSaved?"Review draft saved":"Awaiting extraction"}</p></div>
 <div className="library-actions">
 <button className="secondary small" disabled={!p.question||!!opening} onClick={()=>void open(p.path,"question-paper.pdf")}>View question paper</button>
 <button className="secondary small" disabled={!p.mark||!!opening} onClick={()=>void open(p.path,"mark-scheme.pdf")}>View mark scheme</button><button className="primary small" disabled={!p.question||!p.mark} onClick={()=>setSelectedPath(current=>current===p.path?"":p.path)}>{selectedPath===p.path?"Close review":"Extract & review"}</button>
 </div>
 </div>
 {selectedPath===p.path&&<Suspense fallback={<p role="status">Loading PDF review tools…</p>}><PaperExtractionReview source={{path:p.path,board:p.board,qualification:p.qualification,series:p.series,code:p.code}} onReviewSaved={()=>void refresh()} onPublished={()=>{onPublished?.();void refresh()}}/></Suspense>}</div>)}
 </section>;
}
