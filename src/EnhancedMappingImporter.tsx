import {useState} from "react";
import JSZip from "jszip";
import {supabase} from "./supabase";

export type MappingRow={id:string;board:string;tier:string;series:string;paper:string;question:string;topic:string;strands:string;skills:string;review:string;excelRow:number;marks:number;ao:string;spec:string;gradePercent:Record<number,number|null>;originalSkill?:string;mappingBasis?:string;additionalTags?:string};
type Audit={rows:MappingRow[];duplicates:string[];reviewCount:number;issues:string[]};
const MAX_SIZE=64*1024*1024;
function parseSheet(xml:string,shared:string[]):string[][]{
 const doc=new DOMParser().parseFromString(xml,"application/xml");
 if(doc.querySelector("parsererror"))throw Error("The spreadsheet XML is damaged.");
 const output:string[][]=[];
 for(const row of Array.from(doc.getElementsByTagNameNS("*","row"))){
  const arr:string[]=[];
  for(const cell of Array.from(row.getElementsByTagNameNS("*","c"))){
   const cellName=cell.getAttribute("r")||"";
   const column=cellName.match(/^[A-Z]+/)?.[0]||"";
   let index=0;for(const c of column)index=index*26+c.charCodeAt(0)-64;index--;
   if(index<0||index>100)continue;
   const type=cell.getAttribute("t");
   const raw=cell.getElementsByTagNameNS("*","v")[0]?.textContent||"";
   arr[index]=type==="s"?shared[Number(raw)]||"":type==="inlineStr"?cell.getElementsByTagNameNS("*","is")[0]?.textContent||"":raw;
  }
  output.push(arr);
  if(output.length>15000)throw Error("Spreadsheet exceeds the 15,000-row review limit.");
 }
 return output;
}
export async function inspectFoundationMap(file:File):Promise<Audit>{
 if(file.size>MAX_SIZE||!file.name.toLowerCase().endsWith(".xlsx"))throw Error("Choose an .xlsx file no larger than 64 MB.");
 const zip=await JSZip.loadAsync(file);
 const stringsXml=await zip.file("xl/sharedStrings.xml")?.async("string");
 let shared:string[]=[];
 if(stringsXml){
  const doc=new DOMParser().parseFromString(stringsXml,"application/xml");
  shared=Array.from(doc.getElementsByTagNameNS("*","si")).map(si=>si.textContent||"");
 }
 const workbookXml=await zip.file("xl/workbook.xml")?.async("string");
 const relationshipsXml=await zip.file("xl/_rels/workbook.xml.rels")?.async("string");
 if(!workbookXml||!relationshipsXml)throw Error("Missing workbook worksheets.");
 const workbook=new DOMParser().parseFromString(workbookXml,"application/xml");
 const rels=new DOMParser().parseFromString(relationshipsXml,"application/xml");
 const sheets=Array.from(workbook.getElementsByTagNameNS("*","sheet"));
 const sheet=sheets.find(s=>/(?:foundation|higher) enhanced mapping/i.test(s.getAttribute("name")||""))||sheets[0];
 if(!sheet)throw Error("No mapping worksheet found.");
 const relId=sheet.getAttribute("r:id")||sheet.getAttributeNS("http://schemas.openxmlformats.org/officeDocument/2006/relationships","id");
 const relationship=Array.from(rels.getElementsByTagNameNS("*","Relationship")).find(x=>x.getAttribute("Id")===relId);
 const target=relationship?.getAttribute("Target");
 if(!target)throw Error("Mapping worksheet cannot be located.");
 const path=target.startsWith("/")?target.substring(1):"xl/"+target.replace(/^\.\//,"");
 const xml=await zip.file(path)?.async("string");
 if(!xml)throw Error("Mapping worksheet data is missing.");
 const cells=parseSheet(xml,shared);
 const headers=(cells[0]||[]).map(x=>x?.trim().toLowerCase()||"");
 const required=["question id","exam board","tier","series","paper","question","primary strand","all strands","searchable skills","review recommendation"];
 const missing=required.filter(x=>!headers.includes(x));
 if(missing.length)throw Error("Missing required columns: "+missing.join(", "));
 const col=(row:string[],label:string)=>row[headers.indexOf(label)]?.trim()||"";
 const rows:MappingRow[]=cells.slice(1).filter(row=>col(row,"question id")).map((row,i)=>({
  originalSkill:col(row,"original skill")||col(row,"skill"),mappingBasis:col(row,"mapping basis"),additionalTags:col(row,"additional topic tags"),
  marks:Number(col(row,"maximum marks"))||0,ao:"AO"+col(row,"assessment objective").replace(/^AO/i,""),spec:col(row,"specification refs"),
  gradePercent:Object.fromEntries([1,2,3,4,5,6,7,8,9].map(g=>{const val=col(row,"grade "+g+" success percent");return [g,val!==""&&Number.isFinite(Number(val))?Number(val):null]})),
  id:col(row,"question id"),board:col(row,"exam board"),tier:col(row,"tier"),series:col(row,"series"),paper:col(row,"paper"),question:col(row,"question"),topic:col(row,"primary strand"),strands:col(row,"all strands"),skills:col(row,"searchable skills"),review:col(row,"review recommendation"),excelRow:Number(col(row,"source excel row"))||i+2
 }));
 const seen=new Set<string>(),duplicates:string[]=[];
 for(const row of rows){const key=row.id.toLowerCase();if(seen.has(key))duplicates.push(row.id);seen.add(key)}
 const issues=rows.filter(x=>!x.board||!x.tier||!x.series||!x.paper||!x.question||!x.topic).slice(0,50).map(x=>x.id+": missing matching details");
 return {rows,duplicates:[...new Set(duplicates)],reviewCount:rows.filter(x=>/review|check|suggest/i.test(x.review)).length,issues};
}
export default function EnhancedMappingImporter(){
 const [file,setFile]=useState<File|null>(null);
 const [audit,setAudit]=useState<Audit|null>(null);
 const [busy,setBusy]=useState(false);
 const [status,setStatus]=useState("");
 const [filter,setFilter]=useState("November 2022");
 const inspect=async()=>{
  if(!file)return;setBusy(true);setAudit(null);setStatus("");
  try{const result=await inspectFoundationMap(file);setAudit(result);setStatus("Spreadsheet loaded locally. Preview the entries before archiving for mapping review.");}
  catch(e){setStatus(e instanceof Error?e.message:"Could not inspect spreadsheet.");}
  finally{setBusy(false)}
 };
 const archive=async()=>{
  if(!file||!audit)return;
  setBusy(true);
  try{
   // Flag duplicates and incomplete mappings for human review; private staging is still allowed.
   const {data:{user},error:authError}=await supabase.auth.getUser();
   const {data:approved,error:ownerError}=await supabase.rpc("is_approved_owner");
   if(authError||!user||ownerError||approved!==true)throw Error("An approved owner session is required.");
   const path="enhanced-mapping-intake/"+user.id+"/"+Date.now()+"-"+file.name.replace(/[^A-Za-z0-9._-]/g,"_");
   const {error}=await supabase.storage.from("exam-materials-private").upload(path,file,{upsert:false,contentType:"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"});
   if(error)throw Error(error.message);
   setStatus("Spreadsheet archived privately with its audit warnings for review. Existing question mappings have not been changed.");
   setAudit(null);
  }catch(e){setStatus(e instanceof Error?e.message:"Could not archive the mapping.");}
  finally{setBusy(false)}
 };
 const visible=audit?.rows.filter(x=>!filter||[x.series,x.paper,x.id].join(" ").toLowerCase().includes(filter.toLowerCase())).slice(0,30)||[];
 return <section className="panel" style={{padding:22}}>
 <h2>Import Enhanced Skills Mapping</h2>
 <p className="hint">Upload an .xlsx spreadsheet containing Pearson mappings and enhanced topic tags. Review identifiers and suggested classifications before storing the source privately. This stage does not overwrite published question data.</p>
 <label>Enhanced Skills Mapping (.xlsx)<input aria-label="Enhanced Skills Mapping spreadsheet" type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" disabled={busy} onChange={e=>{setFile(e.target.files?.[0]||null);setAudit(null);setStatus("");}}/></label>
 <div className="row" style={{display:"flex",gap:12,flexWrap:"wrap"}}>
 <button className="secondary" disabled={busy||!file} onClick={()=>void inspect()}>Inspect spreadsheet</button>
 <button className="primary" disabled={busy||!audit} onClick={()=>void archive()}>Archive mapping for review</button>
 </div>
 {audit&&<div style={{marginTop:12}}>
 <p role="status"><strong>{audit.rows.length}</strong> entries · <strong>{audit.duplicates.length}</strong> duplicate IDs · <strong>{audit.reviewCount}</strong> flagged for review · <strong>{audit.issues.length}</strong> incomplete entries</p>
 {audit.duplicates.length>0&&<p role="alert">Duplicate question IDs: {audit.duplicates.slice(0,12).join(", ")}</p>}
 {audit.issues.length>0&&<p role="alert">{audit.issues.length} incomplete entries need attention.</p>}
 <label>Filter preview by series, paper or ID<input aria-label="Filter mapping preview" value={filter} onChange={e=>setFilter(e.target.value)}/></label>
 <div style={{overflowX:"auto",maxHeight:350,overflowY:"auto"}}><table><thead><tr><th>Question ID</th><th>Series</th><th>Paper</th><th>Primary strand</th><th>All strands</th><th>Review</th></tr></thead><tbody>{visible.map((row,i)=><tr key={row.id+"-"+i}><td>{row.id}</td><td>{row.series}</td><td>{row.paper}</td><td>{row.topic}</td><td>{row.strands}</td><td>{row.review}</td></tr>)}</tbody></table></div>
 </div>}
 {status&&<p role="status">{status}</p>}
 </section>;
}
