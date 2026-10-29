import {lazy,Suspense,useEffect,useState} from "react";
const PaperExtractionReview=lazy(()=>import("./PaperExtractionReview"));
import PaperCoverage from "./PaperCoverage";
import type {StagedPaper} from "./paperCoverage";
import {supabase} from "./supabase";

const BUCKET="exam-materials-private";
type Staged=StagedPaper;
type IntakeRow={path:string;board:string;qualification:string;series:string;code:string;question:boolean;mark:boolean;manifest:boolean;review_saved:boolean};
export default function StagedPaperReview({onPublished,refreshKey=0}:{onPublished?:()=>void;refreshKey?:number}){
 const [revision,setRevision]=useState(0),[archiveError,setArchiveError]=useState("");
 const [papers,setPapers]=useState<Staged[]>([]);
 const [loading,setLoading]=useState(false);
 const [message,setMessage]=useState("");
 const [opening,setOpening]=useState("");
 const [selectedPath,setSelectedPath]=useState("");
 const refresh=async()=>{
  if(loading)return;
  setLoading(true);setArchiveError("");
  try{
   // Exactly one owner-checked database RPC replaces folder recursion and
   // downloading every saved review. Approval counts are fetched only on demand.
   const {data,error}=await supabase.rpc("list_owner_exam_intake");
   if(error)throw new Error(error.message);
   const rows=(data||[]) as IntakeRow[];
   setPapers(old=>rows.map(row=>{
    const previous=old.find(p=>p.path===row.path);
    return {
     path:row.path,board:row.board,qualification:row.qualification,
     series:row.series,code:row.code,question:row.question,mark:row.mark,
     manifest:row.manifest,reviewSaved:row.review_saved,
     review:row.review_saved?previous?.review:undefined,
     reviewError:row.review_saved?previous?.reviewError:undefined
    };
   }));
   setMessage(rows.length?`${rows.length} archived paper(s) found. Open a review or select Check approvals to load individual review counts.`:"No staged exam papers found for your account.");
  }catch(e){const reason=e instanceof Error?e.message:"Unable to load the staging archive.";setMessage(reason);setArchiveError(reason)}
  finally{setLoading(false);setRevision(n=>n+1)}
 };
 const checkReview=async(paper:Staged)=>{
  if(!paper.reviewSaved)return;
  setOpening(paper.path+"/extraction-review.json");
  try{
   const {data,error}=await supabase.storage.from(BUCKET).download(paper.path+"/extraction-review.json",{cacheNonce:crypto.randomUUID()},{cache:"no-store"});
   if(error||!data)throw Error(error?.message||"Saved review unavailable");
   const saved=JSON.parse(await data.text());
   if(saved.version!==1||!Array.isArray(saved.items)||!saved.items.length||new Set(saved.items.map((x:{number:number})=>x.number)).size!==saved.items.length)
    throw Error("Saved review is invalid; original file retained");
   setPapers(old=>old.map(p=>p.path===paper.path?{...p,review:{questions:saved.items.length,approved:saved.items.filter((x:{approved:boolean})=>x.approved===true).length},reviewError:undefined}:p));
  }catch(e){setPapers(old=>old.map(p=>p.path===paper.path?{...p,reviewError:e instanceof Error?e.message:"Cannot read saved review"}:p))}
  finally{setOpening("")}
 };
 const exportReviewerPack=async(paper:Staged)=>{
  if(!paper.reviewSaved)return;
  setOpening(paper.path+"/reviewer-pack.zip");
  try{
   const {data:{user},error:authError}=await supabase.auth.getUser();
   const {data:owner,error:ownerError}=await supabase.rpc("is_approved_owner");
   if(authError||!user||ownerError||owner!==true)throw Error("Approved owner sign-in is required.");
   const {buildReviewerPack}=await import("./reviewerPack");
   const bundle=await buildReviewerPack(
    {path:paper.path,board:paper.board,qualification:paper.qualification,series:paper.series,code:paper.code},
    user.id,
    async path=>{
     const {data,error}=await supabase.storage.from(BUCKET).download(path,{cacheNonce:crypto.randomUUID()},{cache:"no-store"});
     if(error||!data)throw Error("Could not download "+path.split("/").pop()+": "+(error?.message||"file unavailable"));
     return data;
    },
    setMessage
   );
   const url=URL.createObjectURL(bundle.blob);
   try{
    const link=document.createElement("a");
    link.href=url;link.download=bundle.filename;
    document.body.append(link);link.click();link.remove();
    setMessage("Private reviewer ZIP downloaded for "+paper.series+" "+paper.code+". Attach the ZIP to this chat for independent crop and mapping checks. Nothing was changed or published.");
   }finally{setTimeout(()=>URL.revokeObjectURL(url),5000)}
  }catch(e){setMessage("Reviewer ZIP not downloaded: "+(e instanceof Error?e.message:String(e)))}
  finally{setOpening("")}
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
 <div><strong>{p.board} · {p.series} · {p.code}</strong><p>{p.qualification} · {p.code.endsWith("F")?"Foundation":"Higher"} · {p.question&&p.mark?"Both PDFs archived":"Missing source file"} · {p.review?`${p.review.approved}/${p.review.questions} approved`:p.reviewSaved?"Review draft saved":"Awaiting extraction"}</p>{p.reviewError&&<p role="alert">{p.reviewError}</p>}</div>
 <div className="library-actions">
 <button className="secondary small" disabled={!p.question||!!opening} onClick={()=>void open(p.path,"question-paper.pdf")}>View question paper</button>
 <button className="secondary small" disabled={!p.mark||!!opening} onClick={()=>void open(p.path,"mark-scheme.pdf")}>View mark scheme</button>{p.reviewSaved&&<button className="secondary small" disabled={!!opening||loading} onClick={()=>void checkReview(p)}>Check approvals</button>}{p.reviewSaved&&<button className="secondary small" disabled={!!opening||loading||!p.question||!p.mark} onClick={()=>void exportReviewerPack(p)}>Download reviewer pack (ZIP)</button>}<button className="primary small" disabled={!p.question||!p.mark} onClick={()=>setSelectedPath(current=>current===p.path?"":p.path)}>{selectedPath===p.path?"Close review":"Extract & review"}</button>
 </div>
 </div>
 {selectedPath===p.path&&<Suspense fallback={<p role="status">Loading PDF review tools…</p>}><PaperExtractionReview source={{path:p.path,board:p.board,qualification:p.qualification,series:p.series,code:p.code}} onReviewSaved={()=>void refresh()} onPublished={()=>{onPublished?.();void refresh()}}/></Suspense>}</div>)}
 </section>;
}
