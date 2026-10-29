import type {PDFDocumentProxy} from "pdfjs-dist";
import {supabase} from "./supabase";
import {drawSlice} from "./pdfExtraction";
import {preparePublication,exportMappedParts} from "./paperPublication";
import {isReviewable,type QuestionDraft,type Slice} from "./paperExtraction";

const bucket="exam-materials-private";
type Source={path:string;board:string;series:string;code:string;qualification:string};
type StoredReview={version:number;mappingFile:string;items:{
 number:number;approved:boolean;question:Slice;mark:Slice;
 overrides?:{id:string;topic:string;strands:string;skills:string}[]
}[]};

function equalSlice(a:Slice,b:Slice){
 return a?.page===b?.page&&(a.endPage??a.page)===(b.endPage??b.page)&&Math.abs(a.top-b.top)<.00001&&Math.abs(a.bottom-b.bottom)<.00001&&(a.left??0)===(b.left??0)&&(a.right??1)===(b.right??1)&&!!a.trimBorder===!!b.trimBorder&&a.borderVersion===b.borderVersion&&a.fragments?.length===b.fragments?.length&&(!a.fragments||a.fragments.every((f,i)=>f.page===b.fragments![i].page&&f.top===b.fragments![i].top&&f.bottom===b.fragments![i].bottom));
}
function reviewMatchesStored(saved:StoredReview,drafts:QuestionDraft[],mappingFile:string){
 if(saved.version!==1||saved.mappingFile!==mappingFile||saved.items?.length!==drafts.length)return false;
 return drafts.every(d=>{
  const entry=saved.items.find(x=>x.number===d.number);
  if(!entry||entry.approved!==true||!equalSlice(entry.question,d.question)||!equalSlice(entry.mark,d.mark))return false;
  return d.parts.every(part=>{
   const override=entry.overrides?.find(x=>x.id===part.id);
   return !!override&&override.topic===part.topic&&override.strands===part.strands&&override.skills===part.skills;
  });
 });
}
async function pngForCrop(pdf:PDFDocumentProxy,crop:Slice):Promise<Blob>{
 const canvas=document.createElement("canvas");
 await drawSlice(pdf,crop,canvas);
 if(!canvas.width||!canvas.height)throw Error("Crop image is empty.");
 const blob=await new Promise<Blob>((resolve,reject)=>{
  canvas.toBlob(value=>value?resolve(value):reject(Error("Could not encode a PNG")),"image/png");
 });
 canvas.width=0;canvas.height=0;
 return blob;
}
async function sha256(blob:Blob){
 const data=await blob.arrayBuffer();
 const digest=await crypto.subtle.digest("SHA-256",data);
 return [...new Uint8Array(digest)].map(b=>b.toString(16).padStart(2,"0")).join("");
}
async function archiveCrop(path:string,blob:Blob){
 const {error}=await supabase.storage.from(bucket).upload(path,blob,{contentType:"image/png",cacheControl:"3600",upsert:false});
 // Immutable content-addressed files can be safely reused on a retry; never replace old images.
 if(error&&!(error.statusCode==="409"||error.message.toLowerCase().includes("already exists")))
  throw new Error("Could not upload reviewed image: "+error.message);
}
export async function publishReviewedPaper(args:{
 source:Source;drafts:QuestionDraft[];questionPdf:PDFDocumentProxy;schemePdf:PDFDocumentProxy;
 mappingFile:string;progress:(message:string)=>void;
}):Promise<string>{
 const {source,drafts,questionPdf,schemePdf,mappingFile,progress}=args;
 if(drafts.some(d=>!isReviewable(d,questionPdf.numPages,schemePdf.numPages)))throw Error("Every crop must be located and valid in its source PDF before publishing.");
 const summary=preparePublication(drafts);
 const {data:{user},error:authError}=await supabase.auth.getUser();
 if(authError||!user)throw Error("Please sign in before publishing.");
 const {data:owner,error:roleError}=await supabase.rpc("is_approved_owner");
 if(roleError||owner!==true)throw Error("Only an approved owner can publish exam papers.");
 if(!source.path.endsWith("/"+user.id))throw Error("This paper is not in your account archive.");
 const reviewPath=source.path+"/extraction-review.json";
 const {data:stored,error:storedError}=await supabase.storage.from(bucket).download(reviewPath);
 if(storedError||!stored)throw Error("First save your full review progress to your account.");
 let review:StoredReview;
 try{review=JSON.parse(await stored.text()) as StoredReview}catch{throw Error("Saved review record is invalid.");}
 if(!reviewMatchesStored(review,drafts,mappingFile))
  throw Error("Review changes are not saved or do not match the source. Click Save review progress to account, then retry.");
 const series=source.series.replace(/-/g," ");
 const tier=source.code.endsWith("F")?"Foundation":"Higher";
 const base="published-papers/"+source.board.toLowerCase()+"/"+
  series.toLowerCase().replace(/\s+/g,"-")+"/"+source.code.toLowerCase()+"/"+user.id+"/";
 // Check before any image upload. The transaction checks again to prevent races.
 const {data:existing,error:lookupError}=await supabase.from("exam_papers").select("id")
  .eq("exam_board",source.board).eq("qualification","GCSE Mathematics")
  .eq("series",series).eq("paper_code",source.code).eq("tier",tier).limit(1);
 if(lookupError)throw Error("Duplicate-paper check failed: "+lookupError.message);
 if(existing?.length)throw Error("This paper is already published; no changes were made.");
 const {data:version,error:versionError}=await supabase.rpc("reviewed_publication_version");
 if(versionError||version!==16)throw Error("Publication requires the V16 database update to preserve all mapping metadata. Your saved review is retained; no images or question records were written.");
 progress("Creating "+(summary.questions*2)+" reviewed images…");
 const items=[];
 for(let i=0;i<drafts.length;i++){
  const draft=drafts[i];
  const paths:{question_path?:string;mark_path?:string}={};
  for(const kind of ["question","mark"] as const){
   progress("Archiving "+(i+1)+"/"+drafts.length+" — Q"+draft.number+" "+(kind==="mark"?"mark scheme":"question")+".");
   const blob=await pngForCrop(kind==="question"?questionPdf:schemePdf,draft[kind]);
   const hash=await sha256(blob);
   const path=base+"Q"+String(draft.number).padStart(2,"0")+"/"+kind+"-"+hash+".png";
   await archiveCrop(path,blob);
   paths[kind==="question"?"question_path":"mark_path"]=path;
  }
  items.push({number:draft.number,approved:true,...paths,parts:exportMappedParts(draft)});
 }
 progress("Verifying "+summary.parts+" mapped parts and publishing atomically…");
 const {data,error}=await supabase.rpc("publish_reviewed_exam_paper",{
  p_board:source.board,p_qualification:"GCSE Mathematics",p_series:series,
  p_code:source.code,p_tier:tier,p_review_path:reviewPath,p_items:items
 });
 if(error)throw Error("Publication was not completed: "+error.message+
  ". The existing question bank is unchanged. Reviewed images can be reused safely on retry.");
 if(typeof data!=="string")throw Error("Publication response was unexpected. Check the question bank before retrying.");
 return data;
}
