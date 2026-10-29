import {describe,it,expect} from 'vitest';
import {restoreSavedReview,type SavedReview} from './savedPaperReview';
import type {QuestionDraft} from './paperExtraction';
const draft=():QuestionDraft=>({number:1,question:{page:4,top:.2,bottom:.8},mark:{page:7,top:.2,bottom:.8},questionDetected:false,questionInferred:false,markDetected:false,approved:false,notes:'',parts:[{id:'original',question:'Q1',marks:2,ao:'AO1',board:'Edexcel',tier:'Foundation',series:'November 2022',paper:'1F',topic:'Number',strands:'Number',skills:'Counting',review:'Check',spec:'N1',excelRow:2,gradePercent:{1:0,5:92},originalSkill:'Pearson skill'}]});
const saved=():SavedReview=>({version:1,mappingFile:'original.xlsx',items:[{number:1,question:{page:2,endPage:3,top:.08,bottom:.76},mark:{page:5,top:.1,bottom:.9},approved:true,notes:'Manually checked',overrides:[{id:'original',topic:'Algebra',strands:'Number; Algebra',skills:'Corrected'}]}]});
describe('saved teacher reviews',()=>{
 it('preserves approved crops, ranges and edits even when new detectors disagree or find a later marking table',()=>{
  const original=saved();const before=JSON.stringify(original);
  const [restored]=restoreSavedReview(original,[draft()],24,18);
  expect(restored.question).toEqual(original.items[0].question);expect(restored.mark).toEqual(original.items[0].mark);
  expect(restored.approved).toBe(true);expect(restored.parts[0]).toMatchObject({topic:'Algebra',skills:'Corrected',gradePercent:{1:0,5:92},originalSkill:'Pearson skill'});
  expect(JSON.stringify(original)).toBe(before);
 });
 it('retains an unapproved saved crop without automatically approving it',()=>{
  const review=saved();review.items[0].approved=false;
  expect(restoreSavedReview(review,[draft()],24,18)[0]).toMatchObject({approved:false,question:review.items[0].question});
 });
 it('blocks damaged crops instead of silently replacing or saving them',()=>{
  const review=saved();review.items[0].question.page=99;
  expect(()=>restoreSavedReview(review,[draft()],24,18)).toThrow(/Original review retained/);
 });
 it('blocks mismatched question sets and duplicate saved numbers',()=>{
  const review=saved();review.items.push({...review.items[0]});
  expect(()=>restoreSavedReview(review,[draft(),{...draft(),number:2}],24,18)).toThrow(/does not match/);
 });
 it('blocks missing or duplicate override IDs',()=>{
  const review=saved();review.items[0].overrides![0].id='different';
  expect(()=>restoreSavedReview(review,[draft()],24,18)).toThrow(/mapping edits/);
 });
});

it('restores only editable metadata fields, never unexpected immutable fields from JSON',()=>{
 const review=saved();Object.assign(review.items[0].overrides![0],{marks:999,ao:'AO0',gradePercent:{1:100}});
 const part=restoreSavedReview(review,[draft()],24,18)[0].parts[0];
 expect(part.marks).toBe(2);expect(part.ao).toBe('AO1');expect(part.gradePercent[1]).toBe(0);
});

it('retains legacy approvals even when metadata needs completing before publication',()=>{
 const review=saved();review.items[0].overrides![0].skills='';
 const restored=restoreSavedReview(review,[draft()],24,18)[0];
 expect(restored.approved).toBe(true);expect(restored.parts[0].skills).toBe('');
 expect(restored.question).toEqual(review.items[0].question);
});

it('keeps old approved crops full width until the teacher explicitly trims the border',()=>{
 const restored=restoreSavedReview(saved(),[{...draft(),question:{...draft().question,trimBorder:true}}],24,18)[0];
 expect(restored.question.trimBorder).toBeUndefined();expect(restored.question.left).toBeUndefined();expect(restored.approved).toBe(true);
});

it('preserves an approved legacy border rendering when new proposals use the outer-frame detector',()=>{
 const original=saved();original.items[0].question.trimBorder=true;
 const [restored]=restoreSavedReview(original,[{...draft(),question:{...draft().question,trimBorder:true,borderVersion:2}}],24,18);
 expect(restored.question).toEqual(original.items[0].question);expect(restored.question.borderVersion).toBeUndefined();expect(restored.approved).toBe(true);
});

it('restores approved page-by-page joins exactly and rejects missing continuation pages',()=>{
 const review=saved();review.items[0].mark={page:6,endPage:7,top:.4,bottom:.35,fragments:[{page:6,top:.4,bottom:.8},{page:7,top:.18,bottom:.35}]};
 expect(restoreSavedReview(review,[draft()],24,18)[0].mark).toEqual(review.items[0].mark);
 review.items[0].mark.fragments!.pop();expect(()=>restoreSavedReview(review,[draft()],24,18)).toThrow(/Original review retained/);
});


it('restores separate supplementary diagram pages and their horizontal bounds exactly',()=>{
 const review=saved();review.items[0].mark={page:6,endPage:9,top:.2,bottom:.6,selectedPagesOnly:true,fragments:[{page:6,top:.2,bottom:.8},{page:9,top:.15,bottom:.6,left:.05,right:.65}]};
 expect(restoreSavedReview(review,[draft()],24,18)[0].mark).toEqual(review.items[0].mark);
 delete review.items[0].mark.selectedPagesOnly;
 expect(()=>restoreSavedReview(review,[draft()],24,18)).toThrow(/Original review retained/);
});
