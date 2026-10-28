import JSZip from 'jszip';
import {supabase} from './supabase';
import {inspectFoundationMap,type MappingRow} from './EnhancedMappingImporter';
import {questionNumber,validSlice} from './paperExtraction';
import type {SavedReview} from './savedPaperReview';
const bucket='exam-materials-private';
export type BatchPaper={board:string;qualification:string;tier:string;series:string;code:string;question:Blob;mark:Blob;review:SavedReview;provenance?:string};
export type IntakeBatch={mapping:Blob;mappingName:string;papers:BatchPaper[]};
const hash=async(blob:Blob)=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',await blob.arrayBuffer())),n=>n.toString(16).padStart(2,'0')).join('');
const message=(e:unknown)=>e instanceof Error?e.message:String((e as {message?:string})?.message||e);
export async function inspectIntakeBatch(file:File):Promise<IntakeBatch>{
 if(file.size>64*1024*1024)throw Error('Choose a review batch ZIP no larger than 64 MB.');
 const zip=await JSZip.loadAsync(file);
 const entries=Object.values(zip.files).filter(x=>!x.dir);
 if(entries.length>100)throw Error('Batch has too many files.');
 let total=0;
 for(const entry of entries){const size=(entry as unknown as {_data?:{uncompressedSize:number}})._data?.uncompressedSize;if(typeof size!=='number'||size>64*1024*1024)throw Error('Invalid or oversized batch entry.');total+=size}
 if(total>200*1024*1024)throw Error('Expanded batch exceeds 200 MB.');
 await JSZip.loadAsync(file,{checkCRC32:true});
 const read=async(path:string,limit:number)=>{if(typeof path!=='string'||path.includes('..')||path.startsWith('/'))throw Error('Invalid batch path.');const entry=zip.file(path);if(!entry)throw Error('Missing batch file: '+path);const blob=await entry.async('blob');if(blob.size>limit)throw Error('Batch file too large: '+path);return blob};
 const manifest=JSON.parse(await (await read('batch.json',1024*1024)).text());
 if(manifest.version!==1||!Array.isArray(manifest.papers)||!manifest.papers.length||manifest.papers.length>24)throw Error('Invalid review batch manifest.');
 if(!/\.(csv|xlsx)$/i.test(manifest.mapping))throw Error('A CSV or XLSX mapping is required.');
 const mapping=await read(manifest.mapping,64*1024*1024);
 const mappingName='batch-'+await hash(mapping)+(/\.csv$/i.test(manifest.mapping)?'.csv':'.xlsx');
 const audit=await inspectFoundationMap(new File([mapping],manifest.mapping));
 const papers:BatchPaper[]=[],seen=new Set<string>();
 for(const p of manifest.papers){
  if(!['Edexcel','AQA'].includes(p.board)||p.qualification!=='GCSE Mathematics'||!['Foundation','Higher'].includes(p.tier)||!/^([123]F|[123]H)$/.test(p.code)||p.code.endsWith('F')!==(p.tier==='Foundation')||!/^(January|June|November|May|March|October|Summer|Autumn) 20\d{2}$/.test(p.series))throw Error('Invalid batch paper identity.');
  const key=[p.board,p.series,p.code].join('/');if(seen.has(key))throw Error('Repeated batch paper: '+key);seen.add(key);
  const rows=audit.rows.filter(r=>r.board===p.board&&r.series===p.series&&r.paper===p.code&&r.tier===p.tier);
  if(!rows.length||new Set(rows.map(r=>r.id.toLowerCase())).size!==rows.length||rows.reduce((n,r)=>n+r.marks,0)!==80)throw Error('Missing, repeated or incomplete mapping for '+key);
  const {validateMappedPart}=await import('./paperPublication');rows.forEach(validateMappedPart);
  const question=await read(p.question,30*1024*1024),mark=await read(p.mark,30*1024*1024);
  for(const pdf of [question,mark])if(await pdf.slice(0,5).text()!=='%PDF-')throw Error('Invalid PDF in '+key);
  const {loadSourcePdf}=await import('./pdfExtraction');
  const pages:number[]=[];for(const blob of [question,mark]){const pdf=await loadSourcePdf(blob);pages.push(pdf.numPages);await pdf.destroy()}
  const proposed=JSON.parse(await (await read(p.review,2*1024*1024)).text()) as SavedReview;
  const numbers=[...new Set(rows.map(questionNumber))];
  if(!Array.isArray(proposed.items)||proposed.items.length!==numbers.length||new Set(proposed.items.map(x=>x.number)).size!==numbers.length)throw Error('Incomplete review proposals for '+key);
  const items=proposed.items.map(item=>{
   if(!numbers.includes(item.number)||item.approved!==false||!validSlice(item.question,pages[0])||!validSlice(item.mark,pages[1]))throw Error('Invalid or pre-approved proposal for '+key);
   return {number:item.number,question:item.question,mark:item.mark,approved:false,notes:'Automatically prepared proposal; teacher review required.',overrides:rows.filter(r=>questionNumber(r)===item.number).map((r:MappingRow)=>({id:r.id,topic:r.topic,strands:r.strands,skills:r.skills}))};
  });
  papers.push({board:p.board,qualification:p.qualification,tier:p.tier,series:p.series,code:p.code,question,mark,review:{version:1,mappingFile:mappingName,markSchemeStartPage:proposed.markSchemeStartPage,items},provenance:typeof p.provenance==="string"?p.provenance.slice(0,500):undefined});
 }
 return {mapping,mappingName,papers};
}
async function retainOrUpload(path:string,blob:Blob,contentType:string){
 const {error}=await supabase.storage.from(bucket).upload(path,blob,{upsert:false,contentType});
 if(!error)return;
 if(error.statusCode!=='409'&&!/already exists|duplicate/i.test(error.message))throw Error(error.message);
 const {data,error:readError}=await supabase.storage.from(bucket).download(path);
 if(readError||!data||await hash(data)!==await hash(blob))throw Error('Different existing source retained: '+path.split('/').pop());
}
export async function archiveIntakeBatch(batch:IntakeBatch,onProgress:(text:string)=>void):Promise<string[]>{
 const {data:{user},error:authError}=await supabase.auth.getUser();
 const {data:owner,error:roleError}=await supabase.rpc('is_approved_owner');
 if(authError||!user||roleError||owner!==true)throw Error('Sign in with your approved owner account.');
 await retainOrUpload('enhanced-mapping-intake/'+user.id+'/'+batch.mappingName,batch.mapping,/\.csv$/i.test(batch.mappingName)?'text/csv':'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
 const results:string[]=[];
 for(const [index,p] of batch.papers.entries()){
  const label=p.series+' '+p.code;onProgress(`Preparing ${index+1}/${batch.papers.length}: ${label}`);
  try{
   const {data:existing,error}=await supabase.from('exam_papers').select('id').eq('exam_board',p.board).eq('qualification',p.qualification).eq('tier',p.tier).eq('paper_code',p.code).ilike('series',p.series).limit(1);
   if(error)throw error;if(existing?.length){results.push(label+': already published; skipped');continue}
   const root=['new-paper-intake',p.board,'GCSE-Mathematics',p.series.replace(/ /g,'-'),p.code,user.id].join('/');
   const {data:files,error:listError}=await supabase.storage.from(bucket).list(root,{limit:100});if(listError)throw listError;
   if(files?.some(x=>x.name==='extraction-review.json')){results.push(label+': existing review retained; skipped');continue}
   await retainOrUpload(root+'/question-paper.pdf',p.question,'application/pdf');
   await retainOrUpload(root+'/mark-scheme.pdf',p.mark,'application/pdf');
   const manifest={board:p.board,qualification:p.qualification,tier:p.tier,series:p.series,paper_code:p.code,state:'awaiting-human-review',source_note:p.provenance};
   if(!files?.some(x=>x.name==='intake.json'))await retainOrUpload(root+'/intake.json',new Blob([JSON.stringify(manifest)],{type:'application/json'}),'application/json');
   const {error:saveError}=await supabase.storage.from(bucket).upload(root+'/extraction-review.json',new Blob([JSON.stringify(p.review)],{type:'application/json'}),{upsert:false,contentType:'application/json'});
   if(saveError)throw Error('Existing review retained or save failed: '+saveError.message);
   results.push(label+': prepared for review; 0 approved');
  }catch(e){results.push(label+': needs attention — '+message(e))}
 }
 return results;
}
