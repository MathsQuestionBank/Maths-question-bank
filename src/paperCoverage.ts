export type PublishedPaper={id:string;exam_board:string;qualification:string;series:string;paper_code:string;tier:string};
export type CoverageQuestion={paper_id:string;marks:number|null};
export type StagedPaper={path:string;board:string;qualification:string;series:string;code:string;question:boolean;mark:boolean;manifest:boolean;reviewSaved:boolean;review?:{questions:number;approved:number};reviewError?:string};
export type CoverageRow={key:string;board:string;series:string;code:string;tier:string;status:string;records:number|null;marks:number|null;staged?:StagedPaper;warning?:string};
export const paperKey=(board:string,series:string,code:string)=>[board,series.replace(/-/g,' '),code].map(s=>s.trim().toLowerCase()).join('|');
/** The requested initial backlog, not a claim that the complete official archive exists. */
export function buildPaperCoverage(published:PublishedPaper[],questions:CoverageQuestion[],staged:StagedPaper[]):CoverageRow[]{
 const rows=new Map<string,CoverageRow>();
 for(const year of [2022,2021,2020])for(const tier of ['Foundation','Higher'])for(const n of [1,2,3]){
  const code=n+(tier==='Foundation'?'F':'H'),series='November '+year;
  const key=paperKey('Edexcel',series,code);
  rows.set(key,{key,board:'Edexcel',series,code,tier,status:'Not imported',records:null,marks:null});
 }
 for(const paper of staged){
  if(!/GCSE[- ]Mathematics/i.test(paper.qualification))continue;
  const key=paperKey(paper.board,paper.series,paper.code);
  const status=paper.reviewError?'Import error':!paper.question||!paper.mark?'PDFs archived':!paper.reviewSaved?'Extraction required':!paper.review?'Review saved — open to check':paper.review.approved===paper.review.questions&&paper.review.questions>0?'Fully approved':paper.review.approved>0?'Partially approved':'Awaiting review';
  rows.set(key,{key,board:paper.board,series:paper.series.replace(/-/g,' '),code:paper.code,tier:paper.code.endsWith('F')?'Foundation':'Higher',status,records:null,marks:null,staged:paper,warning:paper.reviewError});
 }
 for(const paper of published){
  if(paper.qualification!=='GCSE Mathematics')continue;
  const key=paperKey(paper.exam_board,paper.series,paper.paper_code),old=rows.get(key);
  const records=questions.filter(q=>q.paper_id===paper.id);
  rows.set(key,{key,board:paper.exam_board,series:paper.series,code:paper.paper_code,tier:paper.tier,status:'Published',records:(old?.status==='Published'?old.records||0:0)+records.length,marks:records.some(q=>q.marks===null)||old?.status==='Published'&&old.marks===null?null:(old?.status==='Published'?old.marks||0:0)+records.reduce((n,q)=>n+(q.marks||0),0),staged:old?.staged,warning:old?.status==='Published'?'Duplicate published paper identity — investigate without overwriting records':old?.warning||(records.length===0?'Published paper has no visible mapped records; verify data and permissions':undefined)});
 }
 return [...rows.values()];
}
