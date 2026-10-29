import {useEffect,useState} from 'react';
import {supabase} from './supabase';
import {withCoverageRetry} from './coverageRetry';
import {buildPaperCoverage,type PublishedPaper,type CoverageQuestion,type StagedPaper} from './paperCoverage';

export default function PaperCoverage({staged,onOpen,revision,archiveError}:{staged:StagedPaper[];onOpen:(path:string)=>void;revision:number;archiveError:string}){
 const [papers,setPapers]=useState<PublishedPaper[]>([]);
 const [questions,setQuestions]=useState<CoverageQuestion[]>([]);
 const [error,setError]=useState('');
 const [loading,setLoading]=useState(true);
 const [verified,setVerified]=useState(false);
 const [lastChecked,setLastChecked]=useState('');
 const [retryCount,setRetryCount]=useState(0);

 useEffect(()=>{
  let active=true;
  void(async()=>{
   setLoading(true);setError('');
   try{
    const {data:owner}=await withCoverageRetry(async()=>{
     const response=await supabase.rpc('is_approved_owner');
     if(response.error)throw response.error;
     return response;
    },undefined,()=>active);
    if(owner!==true)throw Error('Approved owner access is required to check coverage.');
    const allPapers:PublishedPaper[]=[],allQuestions:CoverageQuestion[]=[];
    for(let offset=0;active;offset+=500){
     const {data}=await withCoverageRetry(async()=>{
      const response=await supabase.from('exam_papers').select('id,exam_board,qualification,series,paper_code,tier').order('id').range(offset,offset+499);
      if(response.error)throw response.error;
      return response;
     },undefined,()=>active);
     allPapers.push(...(data||[]));
     if(!data||data.length<500)break;
    }
    for(let offset=0;active;offset+=500){
     const {data}=await withCoverageRetry(async()=>{
      const response=await supabase.from('questions').select('paper_id,marks').order('id').range(offset,offset+499);
      if(response.error)throw response.error;
      return response;
     },undefined,()=>active);
     allQuestions.push(...(data||[]));
     if(!data||data.length<500)break;
    }
    if(active){setPapers(allPapers);setQuestions(allQuestions);setVerified(true);setLastChecked(new Date().toLocaleTimeString())}
   }catch(e){
    if(active)setError(e instanceof Error?e.message:String((e as {message?:string})?.message||'Coverage lookup failed'));
   }finally{if(active)setLoading(false)}
  })();
  return()=>{active=false};
 },[revision,retryCount]);
 const realArchiveError=archiveError&&archiveError!=='Archive scan in progress'?archiveError:'';
 const warning=error||realArchiveError;
 return <section className="panel" style={{padding:18,marginBottom:16}}>
  <h2>Paper coverage</h2>
  <p className="hint">November 2020–2022 priority backlog plus papers found in the database and your private intake archive. Counts and marks come from published mapped records. Approval status comes from saved review progress; publication still requires full validation. Refresh list to recheck.</p>
  {loading&&<p role="status">Checking live paper coverage…</p>}
  {warning&&<div role="alert"><p>Coverage {verified?'refresh failed':'unavailable'}: {warning}. {verified?'Showing the last verified database snapshot; paper statuses may have changed.':'Missing papers cannot be confirmed.'}</p>
    <button className="secondary small" disabled={loading} onClick={()=>setRetryCount(n=>n+1)}>Retry coverage</button>
   </div>}
  {verified&&<div style={{overflowX:'auto'}}>
   <p className="hint">{warning?'Previous verified results': 'Verified database coverage'}{lastChecked?` · Checked ${lastChecked}`:''}</p>
   <table><thead><tr><th>Board / series</th><th>Tier</th><th>Paper</th><th>Status</th><th>Question records</th><th>Total marks</th><th>Review</th></tr></thead>
   <tbody>{buildPaperCoverage(papers,questions,staged).map(row=><tr key={row.key}><td>{row.board} · {row.series}</td><td>{row.tier}</td><td>{row.code}</td><td>{row.status}{row.warning&&<p role="alert">{row.warning}</p>}</td><td>{row.records??'—'}</td><td>{row.marks??'—'}</td><td>{row.staged&&<button className="secondary small" disabled={!row.staged.question||!row.staged.mark} onClick={()=>onOpen(row.staged!.path)}>Continue review {row.staged.review?`${row.staged.review.approved}/${row.staged.review.questions}`:''}</button>}</td></tr>)}</tbody></table></div>}
 </section>;
}
