import {useEffect,useState} from 'react';
import {supabase} from './supabase';
import {buildPaperCoverage,type PublishedPaper,type CoverageQuestion,type StagedPaper} from './paperCoverage';
export default function PaperCoverage({staged,onOpen,revision,archiveError}:{staged:StagedPaper[];onOpen:(path:string)=>void;revision:number;archiveError:string}){
 const [papers,setPapers]=useState<PublishedPaper[]>([]),[questions,setQuestions]=useState<CoverageQuestion[]>([]),[error,setError]=useState(''),[loading,setLoading]=useState(true);
 useEffect(()=>{let active=true;void(async()=>{
  setLoading(true);setError('');
  try{
   const {data:owner,error:ownerError}=await supabase.rpc('is_approved_owner');
   if(ownerError||owner!==true)throw Error('Approved owner access is required to check coverage.');
   const allPapers:PublishedPaper[]=[],allQuestions:CoverageQuestion[]=[];
   for(let offset=0;;offset+=500){const {data,error}=await supabase.from('exam_papers').select('id,exam_board,qualification,series,paper_code,tier').order('id').range(offset,offset+499);if(error)throw error;allPapers.push(...(data||[]));if(!data||data.length<500)break}
   for(let offset=0;;offset+=500){const {data,error}=await supabase.from('questions').select('paper_id,marks').order('id').range(offset,offset+499);if(error)throw error;allQuestions.push(...(data||[]));if(!data||data.length<500)break}
   if(active){setPapers(allPapers);setQuestions(allQuestions)}
  }catch(e){if(active)setError(e instanceof Error?e.message:String((e as {message?:string})?.message||'Coverage lookup failed'))}
  finally{if(active)setLoading(false)}
 })();return()=>{active=false}},[revision]);
 return <section className="panel" style={{padding:18,marginBottom:16}}><h2>Paper coverage</h2>
 <p className="hint">November 2020–2022 priority backlog plus papers found in the database and your private intake archive. Counts and marks come from published mapped records. Approval status comes from saved review progress; publication still requires full validation. Refresh list to recheck.</p>
 {loading?<p role="status">Checking live paper coverage…</p>:error||archiveError?<p role="alert">Coverage unavailable: {error||archiveError}. Missing papers cannot be confirmed.</p>:<div style={{overflowX:'auto'}}><table><thead><tr><th>Board / series</th><th>Tier</th><th>Paper</th><th>Status</th><th>Question records</th><th>Total marks</th><th>Review</th></tr></thead><tbody>{buildPaperCoverage(papers,questions,staged).map(row=><tr key={row.key}><td>{row.board} · {row.series}</td><td>{row.tier}</td><td>{row.code}</td><td>{row.status}{row.warning&&<p role="alert">{row.warning}</p>}</td><td>{row.records??'—'}</td><td>{row.marks??'—'}</td><td>{row.staged&&<button className="secondary small" disabled={!row.staged.question||!row.staged.mark} onClick={()=>onOpen(row.staged!.path)}>Continue review {row.staged.review?`${row.staged.review.approved}/${row.staged.review.questions}`:''}</button>}</td></tr>)}</tbody></table></div>}
 </section>;
}
