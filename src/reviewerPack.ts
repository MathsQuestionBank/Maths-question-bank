import JSZip from "jszip";

type Source = {path:string; board:string; qualification:string; series:string; code:string};
type SavedReview = {
  version:number;
  mappingFile:string;
  items:{number:number;approved:boolean;question:unknown;mark:unknown;overrides?:unknown}[];
};

/** A private download bundle for independent review; never uploads, approves or publishes. */
export async function buildReviewerPack(
 source:Source,
 ownerId:string,
 download:(path:string)=>Promise<Blob>,
 onProgress:(message:string)=>void=()=>{}
):Promise<{blob:Blob; filename:string;questions:number;approved:number}>{
 if(!ownerId||!source.path.endsWith("/"+ownerId)||
  !/^new-paper-intake\/[a-z0-9_-]+\/GCSE-Mathematics\/[a-z0-9-]+\/[123][FH]\/[0-9a-f-]{36}$/i.test(source.path))
  throw Error("This archived paper is not in the signed-in account.");
 if(!/^[123][FH]$/i.test(source.code))throw Error("Unexpected exam-paper code.");
 onProgress("Reading saved review details…");
 const review=await download(source.path+"/extraction-review.json");
 let saved:SavedReview;
 try{saved=JSON.parse(await review.text()) as SavedReview}
 catch{throw Error("Saved review is not valid JSON; the review was not changed.");}
 if(saved.version!==1||typeof saved.mappingFile!=="string"||
    !/^[^/\\]+\.(?:csv|xlsx)$/i.test(saved.mappingFile)||
    !Array.isArray(saved.items)||!saved.items.length||
    saved.items.some(x=>!Number.isInteger(x.number)||x.number<=0||typeof x.approved!=="boolean"||!x.question||!x.mark)||
    new Set(saved.items.map(x=>x.number)).size!==saved.items.length)
  throw Error("Saved review is invalid or incomplete; no archive data was changed.");

 const zip=new JSZip();
 const entries:[string,string][]=[
  ["question-paper.pdf",source.path+"/question-paper.pdf"],
  ["mark-scheme.pdf",source.path+"/mark-scheme.pdf"],
  [saved.mappingFile,"enhanced-mapping-intake/"+ownerId+"/"+saved.mappingFile]
 ];
 for(const [filename,path] of entries){
  onProgress("Adding "+filename+" to private review ZIP…");
  const blob=await download(path);
  if(!blob.size)throw Error("Archived source file is empty: "+filename);
  zip.file(filename,blob);
 }
 zip.file("extraction-review.json",review);
 zip.file("review-manifest.json",JSON.stringify({
  format:"Maths Question Bank private reviewer pack v1",
  board:source.board,qualification:source.qualification,
  series:source.series,code:source.code,
  completeQuestions:saved.items.length,
  approvedQuestions:saved.items.filter(x=>x.approved).length,
  mappingFile:saved.mappingFile,
  questions:saved.items.map(x=>({number:x.number,approved:x.approved,hasQuestionCrop:!!x.question,hasMarkCrop:!!x.mark}))
 },null,2));
 zip.file("README.txt",
  "MATHS QUESTION BANK — PRIVATE REVIEW PACK\\n"+
  "This ZIP contains Pearson exam source PDFs, an Enhanced Skills Mapping sheet and the saved teacher crop review.\\n"+
  "Only share it privately for review; do not publish the source materials or make this ZIP publicly accessible.\\n"+
  "A reviewer can inspect the PDFs and crop coordinates to flag incorrect crops, missing pages, scheme rows and topic mappings.\\n"+
  "The teacher must still verify final changes and approve/publish them in Maths Question Bank.\\n"+
  "This export does not modify any database records or stored review files.\\n");
 onProgress("Compressing reviewer ZIP…");
 const blob=await zip.generateAsync({type:"blob",compression:"DEFLATE",compressionOptions:{level:3}});
 const safe=(value:string)=>value.replace(/[^a-z0-9_-]+/gi,"-");
 return {
  blob,filename:"MQB-Review-"+safe(source.board)+"-"+safe(source.series)+"-"+source.code.toUpperCase()+".zip",
  questions:saved.items.length,approved:saved.items.filter(x=>x.approved).length
 };
}
