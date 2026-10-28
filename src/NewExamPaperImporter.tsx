import {useState} from "react";
import {supabase} from "./supabase";

const bucket="exam-materials-private";
const MAX_PDF=30*1024*1024;
const isPdf=async(file:File)=>{
 if(file.size<5||file.size>MAX_PDF||!file.name.toLowerCase().endsWith(".pdf"))return false;
 const header=new Uint8Array(await file.slice(0,5).arrayBuffer());
 return String.fromCharCode(...header)==="%PDF-";
};
const slug=(value:string)=>value.trim().replace(/[^a-zA-Z0-9_-]+/g,"-").replace(/^-+|-+$/g,"").slice(0,80);
export default function NewExamPaperImporter({onArchived}:{onArchived?:()=>void}){
 const [board,setBoard]=useState("Edexcel");
 const [qualification,setQualification]=useState("GCSE Mathematics");
 const [tier,setTier]=useState("Foundation");
 const [series,setSeries]=useState("November 2022");
 const [paper,setPaper]=useState("1");
 const [question,setQuestion]=useState<File|null>(null);
 const [markScheme,setMarkScheme]=useState<File|null>(null);
 const [busy,setBusy]=useState(false);
 const [status,setStatus]=useState("");
 const [ready,setReady]=useState(false);
 const code=paper.trim().toUpperCase()+ (tier==="Foundation"?"F":"H");
 const inspect=async()=>{
  setReady(false);setStatus("");
  if(!question||!markScheme||!(await isPdf(question))||!(await isPdf(markScheme))){setStatus("Select a valid question paper and mark scheme PDF, each no larger than 30 MB.");return}
  const seriesMatch=series.trim().match(/^(January|June|November|May|March|October|Summer|Autumn)\s+(20\d{2})$/i);
  if(!seriesMatch){setStatus("Enter a recognised series and year, for example November 2022.");return}
  if(!/^[123]$/.test(paper)){setStatus("Choose paper 1, 2 or 3.");return}
  const canonicalSeries=seriesMatch[1][0].toUpperCase()+seriesMatch[1].slice(1).toLowerCase()+" "+seriesMatch[2];
  setSeries(canonicalSeries);
  setBusy(true);
  try{
   const {data:{user},error:authError}=await supabase.auth.getUser();
   const {data:approved,error:roleError}=await supabase.rpc("is_approved_owner");
   if(authError||!user||roleError||approved!==true)throw Error("An approved account is required.");
   const {data:found,error}=await supabase.from("exam_papers").select("id").eq("exam_board",board).eq("qualification",qualification).eq("tier",tier).eq("paper_code",code).ilike("series",canonicalSeries).limit(1);
   if(error)throw Error(error.message);
   if(found?.length)throw Error("This paper is already registered. Nothing was uploaded; review the existing paper rather than importing it twice.");
   setReady(true);
   setStatus("Checked: no registered paper matches. The PDFs can be archived for review. No questions will be published automatically.");
  }catch(e){setStatus(e instanceof Error?e.message:"Unable to check the paper.")}
  finally{setBusy(false)}
 };
 const archive=async()=>{
  if(!ready||!question||!markScheme)return;
  setBusy(true);setReady(false);
  const base=`new-paper-intake/${slug(board)}/${slug(qualification)}/${slug(series)}/${code}/`;
  const files:[string,File][]=[["question-paper.pdf",question],["mark-scheme.pdf",markScheme]];
  try{
   if(!await isPdf(question)||!await isPdf(markScheme))throw Error("PDF validation failed.");
   const {data:{user}}=await supabase.auth.getUser();
   const {data:approved,error:roleError}=await supabase.rpc("is_approved_owner");
   if(!user||roleError||approved!==true)throw Error("An approved owner session is required.");
   const {data:existing,error:lookupError}=await supabase.from("exam_papers").select("id").eq("exam_board",board).eq("qualification",qualification).eq("tier",tier).eq("paper_code",code).ilike("series",series.trim()).limit(1);
   if(lookupError)throw Error(lookupError.message);
   if(existing?.length)throw Error("A matching paper now exists. No files were overwritten.");
   const folder=`${base}${user.id}/`;
   const {data:archived,error:listError}=await supabase.storage.from(bucket).list(folder.replace(/\/$/,""),{limit:100});
   if(listError)throw Error("Cannot check existing archive: "+listError.message);
   for(const [name,file] of files){
    if(archived?.some(x=>x.name===name)){
     const {data:old,error:readError}=await supabase.storage.from(bucket).download(folder+name);
     if(readError||!old)throw Error("Cannot verify existing "+name+"; nothing was overwritten.");
     const hash=async(blob:Blob)=>Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",await blob.arrayBuffer()))).join(",");
     if(await hash(old)!==await hash(file))throw Error("A different "+name+" is already archived. Continue its existing review; original source retained.");
     continue;
    }
    setStatus(`Uploading ${name} to private source storage…`);
    const {error}=await supabase.storage.from(bucket).upload(folder+name,file,{contentType:"application/pdf",upsert:false});
    if(error)throw Error(`Could not archive ${name}: ${error.message}. Any earlier uploaded source remains private and can be reviewed; nothing was published.`);
   }
   const manifest={board,qualification,tier,series:series.trim(),paper_code:code,uploaded_at:new Date().toISOString(),state:"awaiting-extraction-and-human-review",question_file:question.name,mark_scheme_file:markScheme.name};
   const {error}=archived?.some(x=>x.name==="intake.json")?{error:null}:await supabase.storage.from(bucket).upload(folder+"intake.json",new Blob([JSON.stringify(manifest,null,2)],{type:"application/json"}),{contentType:"application/json",upsert:false});
   if(error)throw Error("PDFs archived, but the intake manifest was not saved: "+error.message);
   onArchived?.();
   setStatus("Source PDFs archived privately. No exam paper or questions have been added to the searchable bank. Extraction, crop review and Enhanced Skills Mapping are the next stage.");
  }catch(e){setStatus(e instanceof Error?e.message:"Upload failed.");}
  finally{setBusy(false)}
 };
 return <section className="panel" style={{padding:22}}>
 <h2>Import New Exam Paper</h2>
 <p className="hint">Stage a new paper and mark scheme in private storage. Check the details and files before uploading. Questions will only be available to teachers after separate extraction and review.</p>
 <div className="library-toolbar" style={{alignItems:"end",flexWrap:"wrap"}}>
 <label>Exam board<select aria-label="New paper exam board" value={board} onChange={e=>{setBoard(e.target.value);setReady(false)}}><option>Edexcel</option><option>AQA</option></select></label>
 <label>Qualification<select aria-label="New paper qualification" value={qualification} onChange={e=>{setQualification(e.target.value);setReady(false)}}><option>GCSE Mathematics</option></select></label>
 <label>Tier<select aria-label="New paper tier" value={tier} onChange={e=>{setTier(e.target.value);setReady(false)}}><option>Foundation</option><option>Higher</option></select></label>
 <label>Series<input aria-label="New paper exam series" value={series} onChange={e=>{setSeries(e.target.value);setReady(false)}}/></label>
 <label>Paper<select aria-label="New paper number" value={paper} onChange={e=>{setPaper(e.target.value);setReady(false)}}>{["1","2","3"].map(x=><option key={x}>{x}</option>)}</select></label>
 </div>
 <p className="hint">Paper identifier: <strong>{code}</strong></p>
 <div className="library-toolbar" style={{flexWrap:"wrap"}}>
 <label>Question paper (PDF)<input aria-label="New question paper PDF" type="file" accept=".pdf,application/pdf" disabled={busy} onChange={e=>{setQuestion(e.target.files?.[0]||null);setReady(false)}}/></label>
 <label>Mark scheme (PDF)<input aria-label="New mark scheme PDF" type="file" accept=".pdf,application/pdf" disabled={busy} onChange={e=>{setMarkScheme(e.target.files?.[0]||null);setReady(false)}}/></label>
 </div>
 <div className="row" style={{display:"flex",gap:12,flexWrap:"wrap"}}>
 <button className="secondary" disabled={busy||!question||!markScheme} onClick={()=>void inspect()}>Check paper</button>
 <button className="primary" disabled={busy||!ready} onClick={()=>void archive()}>{busy?"Working…":"Archive PDFs for review"}</button>
 </div>
 {status&&<p role="status">{status}</p>}
 </section>
}
