import {describe,it,expect} from 'vitest';
import {inspectFoundationMap,parseMappingCsv} from './EnhancedMappingImporter';
const header=['Question ID','Exam board','Tier','Series','Paper','Question','Primary strand','All strands','Searchable skills','Review recommendation','Maximum marks','Assessment objective','Specification refs','Skill tested (Pearson)','Secondary strands','Mapping basis','Grade 5 success percent','Grade 9 success percent'];
const record=['edexcel-2022-2F-Q1','Edexcel','Foundation','November 2022','2F','Q1','Number','Number; Algebra','Rounding','Check', '2','1','N1','Original Pearson skill','Algebra','Teacher review','0',''];
const csv=(cells:string[])=>cells.map(x=>'"'+x.replace(/"/g,'""')+'"').join(',');
describe('enhanced CSV mapping',()=>{
 it('preserves quoted commas, newlines, escaped quotes, BOM and CRLF',()=>{
  expect(parseMappingCsv('\uFEFFa,b\r\n"comma, skill","line 1\nline ""2"""\r\n')).toEqual([['a','b'],['comma, skill','line 1\nline "2"']]);
 });
 it.each(['a,b\n"unterminated,b','a,b\n"a"oops,b','a,b\nonly-one'])('rejects damaged CSV: %s',text=>expect(()=>parseMappingCsv(text)).toThrow());
 it('retains source skills, secondary tags, exact zero percentages and missing values',async()=>{
  const text=csv(header)+'\r\n'+csv(record);
  const audit=await inspectFoundationMap({name:'Foundation.csv',size:text.length,text:async()=>text} as File);
  expect(audit.rows).toHaveLength(1);expect(audit.duplicates).toEqual([]);
  expect(audit.rows[0]).toMatchObject({originalSkill:'Original Pearson skill',additionalTags:'Algebra',mappingBasis:'Teacher review',gradePercent:{5:0,9:null},marks:2,ao:'AO1'});
 });
 it('retains Higher grade 9 values and detects duplicate identifiers',async()=>{
  const higher=[...record];higher[2]='Higher';higher[17]='72.5';
  const text=[csv(header),csv(higher),csv(higher)].join('\n');
  const audit=await inspectFoundationMap({name:'Higher.csv',size:text.length,text:async()=>text} as File);
  expect(audit.rows[0].gradePercent[9]).toBe(72.5);expect(audit.duplicates).toEqual([record[0]]);
 });
});

it('uses the original Pearson skill when enhanced searchable skills are blank',async()=>{
 const row=[...record];row[8]='';
 const text=csv(header)+'\n'+csv(row);
 const audit=await inspectFoundationMap({name:'Foundation.csv',size:text.length,text:async()=>text} as File);
 expect(audit.rows[0].skills).toBe('Original Pearson skill');expect(audit.rows[0].originalSkill).toBe('Original Pearson skill');
 expect(audit.issues).toEqual([]);
});
