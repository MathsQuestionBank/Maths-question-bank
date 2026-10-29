import {beforeEach,describe,it,expect,vi} from 'vitest';
const mock=vi.hoisted(()=>({session:vi.fn(),range:vi.fn()}));
vi.mock('./supabase',()=>{
 const query={select:()=>query,order:()=>query,range:mock.range};
 return {supabase:{auth:{getSession:mock.session},from:()=>query}};
});
import {loadBankQuestions} from './questionData';
beforeEach(()=>{vi.resetAllMocks();mock.session.mockResolvedValue({data:{session:{user:{id:'owner'}}},error:null})});
const record=(id:string)=>({id,topic:'Number',skill:'Fractions',marks:2,assessment_objective:'AO1',metadata:{id:'EDX-F-NOVEMBER2022-1F-Q01a',tier:'Foundation',whole_key:'Edexcel_November 2022_1F_Q01',whole_marks:5,g1:42,g5:94},exam_papers:{exam_board:'Edexcel',paper_code:'1F',series:'November 2022',tier:'Foundation'}});
describe('complete question-bank reads',()=>{
 it('loads beyond a database page and retains whole-question and Foundation performance metadata',async()=>{
  mock.range.mockResolvedValueOnce({data:Array.from({length:500},(_,i)=>record(String(i))),error:null}).mockResolvedValueOnce({data:[record('last')],error:null});
  const rows=await loadBankQuestions();expect(rows).toHaveLength(501);
  expect(mock.range.mock.calls).toEqual([[0,499],[500,999]]);
  expect(rows[500]).toMatchObject({id:'last',wholeKey:'Edexcel_November 2022_1F_Q01',wholeMarks:5,examBoard:'Edexcel',paperCode:'1F',gradePerformance:{1:42,5:94,9:null}});
 });
 it('labels other boards from their linked paper rather than assuming Edexcel',async()=>{
  const aqa={...record('aqa'),exam_papers:{exam_board:'AQA',paper_code:'2F',series:'June 2023',tier:'Foundation'}};
  mock.range.mockResolvedValueOnce({data:[aqa],error:null});
  const rows=await loadBankQuestions();
  expect(rows[0]).toMatchObject({examBoard:'AQA',paperCode:'2F',series:'June 2023'});
 });
 it('fails visibly if a later database page fails instead of returning an incomplete bank',async()=>{
  mock.range.mockResolvedValueOnce({data:Array.from({length:500},(_,i)=>record(String(i))),error:null}).mockResolvedValueOnce({data:null,error:{message:'Read denied',code:'42501'}});
  await expect(loadBankQuestions()).rejects.toThrow(/Read denied/);
 });
});
