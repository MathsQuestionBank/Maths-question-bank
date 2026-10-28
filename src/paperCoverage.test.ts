import {describe,it,expect} from 'vitest';
import {buildPaperCoverage,type StagedPaper} from './paperCoverage';
const source:StagedPaper={path:'private/owner',board:'Edexcel',qualification:'GCSE-Mathematics',series:'November-2022',code:'1F',question:true,mark:true,manifest:true,reviewSaved:true};
const paper={id:'p1',exam_board:'Edexcel',qualification:'GCSE Mathematics',series:'November 2022',paper_code:'1F',tier:'Foundation'};
describe('live coverage without invented publication claims',()=>{
 it('shows the requested backlog as missing until real records or sources are supplied',()=>{
  const rows=buildPaperCoverage([],[],[]);expect(rows).toHaveLength(18);expect(rows.every(r=>r.status==='Not imported'&&r.records===null)).toBe(true);
 });
 it.each([[0,'Awaiting review'],[12,'Partially approved'],[26,'Fully approved']])('derives saved approval %s as %s',(approved,status)=>{
  const row=buildPaperCoverage([],[],[{...source,review:{approved:Number(approved),questions:26}}]).find(r=>r.code==='1F'&&r.series==='November 2022');
  expect(row?.status).toBe(status);expect(row?.records).toBeNull();
 });
 it('published records take precedence over retained approved reviews',()=>{
  const row=buildPaperCoverage([paper],[{paper_id:'p1',marks:2},{paper_id:'p1',marks:3}],[{...source,review:{approved:26,questions:26}}]).find(r=>r.code==='1F'&&r.series==='November 2022');
  expect(row).toMatchObject({status:'Published',records:2,marks:5,staged:source});
 });
 it('reports duplicates and unreadable review data without modifying either',()=>{
  const row=buildPaperCoverage([paper,{...paper,id:'p2'}],[],[{...source,reviewError:'Unreadable review'}]).find(r=>r.code==='1F'&&r.series==='November 2022');
  expect(row?.warning).toMatch(/Duplicate/);
  expect(buildPaperCoverage([],[],[{...source,reviewError:'Unreadable review'}]).find(r=>r.staged)?.status).toBe('Import error');
 });
});
