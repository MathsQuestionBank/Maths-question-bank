import {beforeEach,describe,it,expect,vi} from 'vitest';
import type {PDFDocumentProxy} from 'pdfjs-dist';
import type {QuestionDraft} from './paperExtraction';
const mock=vi.hoisted(()=>({getUser:vi.fn(),owner:vi.fn(),version:vi.fn(),publish:vi.fn(),download:vi.fn(),upload:vi.fn(),lookup:vi.fn(),draw:vi.fn()}));
vi.mock('./pdfExtraction',()=>({drawSlice:mock.draw}));
vi.mock('./supabase',()=>{
 const query={select:()=>query,eq:()=>query,limit:mock.lookup};
 return {supabase:{auth:{getUser:mock.getUser},rpc:(name:string,...args:unknown[])=>name==='is_approved_owner'?mock.owner(...args):name==='reviewed_publication_version'?mock.version(...args):mock.publish(...args),from:()=>query,storage:{from:()=>({download:mock.download,upload:mock.upload})}}};
});
import {publishReviewedPaper} from './publishReviewedPaper';
const source={path:'new-paper-intake/Edexcel/GCSE-Mathematics/November-2022/1F/owner',board:'Edexcel',qualification:'GCSE-Mathematics',series:'November-2022',code:'1F'};
const drafts=():QuestionDraft[]=>Array.from({length:4},(_,i)=>({number:i+1,approved:true,notes:'',questionDetected:true,questionInferred:false,markDetected:true,question:{page:2,top:.1,bottom:.8},mark:{page:6,top:.2,bottom:.8},parts:[{id:'id'+i,question:'Q0'+(i+1),marks:20,ao:'AO1',topic:'Number',strands:'Number; Ratio',skills:'Arithmetic',board:'Edexcel',tier:'Foundation',series:'November 2022',paper:'1F',review:'Reviewed',excelRow:i+2,spec:'N1',gradePercent:{1:20,5:90}}]}));
const saved=(items:QuestionDraft[])=>({version:1,mappingFile:'original.xlsx',items:items.map(d=>({number:d.number,approved:d.approved,question:d.question,mark:d.mark,overrides:d.parts.map(p=>({id:p.id,topic:p.topic,strands:p.strands,skills:p.skills}))}))});
const pdf={numPages:10} as PDFDocumentProxy;
const args=(items=drafts())=>({source,drafts:items,questionPdf:pdf,schemePdf:pdf,mappingFile:'original.xlsx',progress:vi.fn()});
beforeEach(()=>{
 vi.resetAllMocks();
 mock.getUser.mockResolvedValue({data:{user:{id:'owner'}},error:null});mock.owner.mockResolvedValue({data:true,error:null});
 mock.version.mockResolvedValue({data:16,error:null});
 mock.lookup.mockResolvedValue({data:[],error:null});mock.upload.mockResolvedValue({error:null});mock.publish.mockResolvedValue({data:'published-paper',error:null});
 mock.download.mockResolvedValue({data:new Blob([JSON.stringify(saved(drafts()))]),error:null});
 vi.stubGlobal('document',{createElement:()=>({width:1,height:1,toBlob:(fn:(b:Blob)=>void)=>fn(new Blob(['png']))})});
});
describe('reviewed publication orchestration (mock database)',()=>{
 it('rejects a non-owner without uploading images or calling publication',async()=>{
  mock.owner.mockResolvedValue({data:false,error:null});await expect(publishReviewedPaper(args())).rejects.toThrow(/approved owner/);
  expect(mock.upload).not.toHaveBeenCalled();expect(mock.publish).not.toHaveBeenCalled();
 });
 it('rejects duplicate published papers before rendering or uploading',async()=>{
  mock.lookup.mockResolvedValue({data:[{id:'existing'}],error:null});await expect(publishReviewedPaper(args())).rejects.toThrow(/already published/);
  expect(mock.draw).not.toHaveBeenCalled();expect(mock.publish).not.toHaveBeenCalled();
 });
 it('refuses unsaved manual crops and changed multi-page ranges',async()=>{
  const items=drafts();items[0].question.endPage=3;
  await expect(publishReviewedPaper(args(items))).rejects.toThrow(/not saved/);
  expect(mock.upload).not.toHaveBeenCalled();
 });
 it('uses approved saved coordinates and private immutable paths',async()=>{
  expect(await publishReviewedPaper(args())).toBe('published-paper');
  expect(mock.draw).toHaveBeenCalledWith(pdf,{page:2,top:.1,bottom:.8},expect.anything());
  expect(mock.upload).toHaveBeenCalledTimes(8);
  for(const [path,,options] of mock.upload.mock.calls){expect(path).toMatch(/^published-papers\/edexcel\/november-2022\/1f\/owner\//);expect(options.upsert).toBe(false)}
  expect(mock.publish).toHaveBeenCalledTimes(1);expect(mock.publish.mock.calls[0][0].p_items).toHaveLength(4);
 });
 it('reports atomic RPC failure and never writes directly to paper or question tables',async()=>{
  mock.publish.mockResolvedValue({data:null,error:{message:'transaction rejected'}});
  await expect(publishReviewedPaper(args())).rejects.toThrow(/transaction rejected/);
  expect(mock.publish).toHaveBeenCalledTimes(1);
 });
 it('rejects unapproved or unlocated questions before any upload',async()=>{
  const items=drafts();items[0].approved=false;await expect(publishReviewedPaper(args(items))).rejects.toThrow(/Approve/);
  items[0].approved=true;items[0].questionDetected=false;
  await expect(publishReviewedPaper(args(items))).rejects.toThrow(/located/);expect(mock.upload).not.toHaveBeenCalled();
 });
});

it('blocks legacy V15 servers before writing images or dropping new mapping fields',async()=>{
 mock.version.mockResolvedValue({data:null,error:{message:'function missing'}});
 await expect(publishReviewedPaper(args())).rejects.toThrow(/V16 database update/);
 expect(mock.upload).not.toHaveBeenCalled();expect(mock.publish).not.toHaveBeenCalled();
});

it('requires horizontal crop and border-trimming changes to be saved before publication',async()=>{
 const items=drafts();items[0].question.left=.06;items[0].question.trimBorder=true;
 await expect(publishReviewedPaper(args(items))).rejects.toThrow(/not saved/);
 expect(mock.upload).not.toHaveBeenCalled();
});

it('requires a changed border-rendering version to be saved before publication',async()=>{
 const items=drafts();items[0].question.borderVersion=2;
 await expect(publishReviewedPaper(args(items))).rejects.toThrow(/not saved/);expect(mock.upload).not.toHaveBeenCalled();
});

it('requires changed page joins to be saved before publication',async()=>{
 const items=drafts();items[0].mark={page:6,endPage:7,top:.2,bottom:.8,fragments:[{page:6,top:.2,bottom:.7},{page:7,top:.2,bottom:.8}]};
 mock.download.mockResolvedValue({data:new Blob([JSON.stringify(saved(items))]),error:null});
 items[0].mark={...items[0].mark,fragments:items[0].mark.fragments!.map((f,i)=>i?{...f,top:.3}:f)};
 await expect(publishReviewedPaper(args(items))).rejects.toThrow(/not saved/);expect(mock.upload).not.toHaveBeenCalled();
});


it('blocks unsaved supplemental page selection and fragment horizontal bounds',async()=>{
 for(const change of ['selectedPagesOnly','left'] as const){
  const items=drafts();items[0].mark={page:6,endPage:7,top:.2,bottom:.8,fragments:[{page:6,top:.2,bottom:.7},{page:7,top:.2,bottom:.8}]};
  mock.download.mockResolvedValue({data:new Blob([JSON.stringify(saved(items))]),error:null});
  if(change==='selectedPagesOnly')items[0].mark.selectedPagesOnly=true;
  else items[0].mark.fragments![1].left=.1;
  await expect(publishReviewedPaper(args(items))).rejects.toThrow(/not saved/);expect(mock.upload).not.toHaveBeenCalled();
 }
});
