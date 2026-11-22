import {describe,it,expect} from "vitest";
import JSZip from "jszip";
import {inspectShadowBundle,sha,type Original,type Bundle} from "./shadowBundle";
import {stageShadowBundle,type Intake,type Registration,type StagingPort} from "./stageShadowBundle";
const id=(n:number)=>`00000000-0000-4000-8000-${String(n).padStart(12,"0")}`;
const original:Original={id:id(1),exam_board:"Edexcel",qualification:"GCSE Mathematics",series:"November 2024",tier:"Foundation",paper_code:"1F"};
const enc=new TextEncoder();const png=Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII='),c=>c.charCodeAt(0));
async function fixture(change?:(m:any,z:JSZip)=>void){const z=new JSZip(),pdf=enc.encode('%PDF-1.4\nsynthetic\n%%EOF');const ph=await sha(pdf),ih=await sha(png);const assets=[],parts=[];
 for(let n=1;n<=4;n++){parts.push({question:`Q0${n}`,marks:20,topic:"Number",skill:"Fractions",proposed_original_question_id:id(n+10),candidate_original_record_id:id(n+10),original_link_verification:"unverified",shadow_of_question_id:null,approved:false,ao:null,spec:null,ao_spec_status:"provisional"});for(const kind of ["question","mark"]){const path=`drafts/Q0${n}/${kind}-${ih}.png`;assets.push({number:n,kind,relative_storage_path:path,sha256:ih,approved:false,crop_review:"unreviewed",source_pages:[n]});z.file(path,png);}}
 const m={version:1,kind:"official-shadow",status:"awaiting-review",original_paper_id:original.id,shadow_set:"Set 1",metadata:{exam_board:"Pearson Edexcel",qualification:"GCSE Mathematics (1MA1)",series:original.series,tier:original.tier,paper_code:"1MA1/1F",calculator:false,total_marks:80},parts,assets,counts:{questions:4,parts:4,marks:80,question_images:4,mark_scheme_images:4},question_source_relative_path:"question-paper.pdf",mark_scheme_source_relative_path:"mark-scheme.pdf",source_files:{question:{sha256:ph},mark:{sha256:ph}},original_stored_image_verification:"outstanding",publication:{selectable:false,teacher_approved:false,question_records_created:false},teacher_review:{Q7:"Physical scale check",Q22b:"Original example inconsistent",AO_and_specification:"Provisional"}};
 z.file('question-paper.pdf',pdf);z.file('mark-scheme.pdf',pdf);change?.(m,z);z.file('intake.json',JSON.stringify(m));return new Uint8Array(await z.generateAsync({type:'uint8array'}));}
class Memory implements StagingPort{
 files=new Map<string,Uint8Array>();row:Intake|null=null;puts:string[]=[];registrations=0;allowed=true;failPath="";lostRegistrationResponse=false;
 async owner(){if(!this.allowed)throw Error('Owner denied');return id(99);}
 async validateOriginal(){}
 async findIntake(){return this.row;}
 async children(prefix:string){return [...this.files.keys()].filter(k=>k.startsWith(prefix));}
 async read(path:string){return this.files.get(path)||null;}
 async put(path:string,b:Uint8Array){if(path.endsWith(this.failPath)&&this.failPath)throw Error('Interrupted');if(this.files.has(path))throw Error('No overwrite');this.files.set(path,b.slice());this.puts.push(path);}
 async register(r:Registration){this.registrations++;this.row={...r,id:id(88)};if(this.lostRegistrationResponse)throw Error('Lost response');return this.row;}
}
describe('complete private shadow staging',()=>{
 it('validates the complete ZIP without removing draft metadata',async()=>{const b=await inspectShadowBundle(await fixture(),original);expect(b).toMatchObject({questions:4,parts:4,marks:80});expect(b.files).toHaveLength(11);expect(b.manifest).toMatchObject({original_stored_image_verification:'outstanding',teacher_review:{Q7:'Physical scale check',Q22b:'Original example inconsistent'}});});
 it('rejects mismatched paper, marks, approval claims, missing files and wrong hashes',async()=>{for(const change of [(m:any)=>{m.metadata.series='June 2024'},(m:any)=>{m.parts[0].marks=19},(m:any)=>{m.parts[0].approved=true},(m:any,z:JSZip)=>{z.remove('question-paper.pdf')},(m:any)=>{m.assets[0].sha256='a'.repeat(64)},(m:any)=>{m.parts[0].shadow_of_question_id=id(45)},(m:any,z:JSZip)=>{z.file('extra.txt','unexpected')}])await expect(inspectShadowBundle(await fixture(change),original)).rejects.toThrow();});
 it('rejects traversal and duplicate archive paths before JSZip sanitisation',async()=>{
  const raw=await fixture((m,z)=>z.file('unsafe.png','x'));const txt=new TextDecoder('latin1').decode(raw);const bytes=raw.slice();const needle=enc.encode('unsafe.png'),replacement=enc.encode('../bad.png');for(let i=0;i<=bytes.length-needle.length;i++)if(needle.every((b,j)=>bytes[i+j]===b))bytes.set(replacement,i);expect(txt).toContain('unsafe.png');await expect(inspectShadowBundle(bytes,original)).rejects.toThrow(/Unsafe/);
 });
 it('rejects duplicate raw entries and excessive declared expansion',async()=>{
  const bytes=await fixture((m,z)=>{z.file('one.png','x');z.file('two.png','y');});
  const needle=enc.encode('two.png'),replacement=enc.encode('one.png'),duplicate=bytes.slice();
  for(let i=0;i<=duplicate.length-needle.length;i++)if(needle.every((b,j)=>duplicate[i+j]===b))duplicate.set(replacement,i);
  await expect(inspectShadowBundle(duplicate,original)).rejects.toThrow(/duplicate/);
  const expanded=(await fixture()).slice(),view=new DataView(expanded.buffer);for(let i=0;i<expanded.length-46;i++)if(view.getUint32(i,true)===0x02014b50){view.setUint32(i+24,31*1024*1024,true);break;}
  await expect(inspectShadowBundle(expanded,original)).rejects.toThrow(/oversized/);
 });
 it('reconciles an upload that stored bytes before its response was lost',async()=>{const b=await inspectShadowBundle(await fixture(),original),p=new Memory();const put=p.put.bind(p);p.put=async(path,bytes)=>{await put(path,bytes);throw Error('Response lost');};await expect(stageShadowBundle(b,p)).resolves.toMatchObject({verifiedFiles:11});expect(p.registrations).toBe(1);});
 it('stops without registration if the owner loses access mid-upload',async()=>{const b=await inspectShadowBundle(await fixture(),original),p=new Memory();const put=p.put.bind(p);p.put=async(path,bytes)=>{await put(path,bytes);if(p.puts.length===3)p.allowed=false;};await expect(stageShadowBundle(b,p)).rejects.toThrow(/Owner denied/);expect(p.registrations).toBe(0);});
 it('rejects an archive that understates expanded entry sizes',async()=>{
  const bytes=await fixture(),v=new DataView(bytes.buffer);const name=enc.encode('question-paper.pdf');
  for(let i=0;i<bytes.length-46;i++)if(v.getUint32(i,true)===0x02014b50&&name.every((b,j)=>bytes[i+46+j]===b)){v.setUint32(i+24,1,true);break;}
  await expect(inspectShadowBundle(bytes,original)).rejects.toThrow();
 });
 it('creates only a private intake after all remote files verify',async()=>{const b=await inspectShadowBundle(await fixture(),original),p=new Memory();const r=await stageShadowBundle(b,p);expect(r).toMatchObject({verifiedFiles:11,questions:4,parts:4,marks:80,private:true,selectableQuestionRecordsCreated:0});expect(p.row?.status).toBe('awaiting-review');expect(p.registrations).toBe(1);});
 it('does no writes when owner verification fails',async()=>{const b=await inspectShadowBundle(await fixture(),original),p=new Memory();p.allowed=false;await expect(stageShadowBundle(b,p)).rejects.toThrow(/Owner denied/);expect(p.puts).toEqual([]);expect(p.row).toBeNull();});
 it('resumes interrupted uploads without rewriting completed files',async()=>{const b=await inspectShadowBundle(await fixture(),original),p=new Memory();p.failPath=b.files[3].path;await expect(stageShadowBundle(b,p)).rejects.toThrow(/not verified/);expect(p.row).toBeNull();const completed=p.puts.slice();p.failPath='';await stageShadowBundle(b,p);expect(p.registrations).toBe(1);expect(new Set(p.puts).size).toBe(p.puts.length);for(const k of completed)expect(p.puts.filter(x=>x===k)).toHaveLength(1);});
 it('reconciles a registration that committed before its response was lost',async()=>{const b=await inspectShadowBundle(await fixture(),original),p=new Memory();p.lostRegistrationResponse=true;await stageShadowBundle(b,p);const count=p.puts.length;await stageShadowBundle(b,p);expect(p.registrations).toBe(1);expect(p.puts.length).toBe(count);});
 it('blocks a different bundle for an already-claimed set',async()=>{const b=await inspectShadowBundle(await fixture(),original),p=new Memory();p.failPath=b.files[0].path;await expect(stageShadowBundle(b,p)).rejects.toThrow();const other=await inspectShadowBundle(await fixture(m=>{m.teacher_review.Q7='New review note'}),original);const before=p.puts.length;await expect(stageShadowBundle(other,p)).rejects.toThrow(/conflicting/);expect(p.puts.length).toBe(before);});
 it('does not overwrite mismatching remote bytes',async()=>{const b=await inspectShadowBundle(await fixture(),original),p=new Memory();await stageShadowBundle(b,p);const key=p.row!.question_source_path;p.files.set(key,enc.encode('changed'));const before=p.puts.length;await expect(stageShadowBundle(b,p)).rejects.toThrow(/conflicts/);expect(p.puts.length).toBe(before);});
 it('does not register if an object cannot be read back',async()=>{const b=await inspectShadowBundle(await fixture(),original),p=new Memory();p.put=async(path,bytes)=>{if(path.endsWith('upload-claim.json')){p.files.set(path,bytes);return;}throw Error('Network');};await expect(stageShadowBundle(b,p)).rejects.toThrow(/not verified/);expect(p.registrations).toBe(0);});
 it('blocks legacy partial folders and already reviewed sets',async()=>{const b=await inspectShadowBundle(await fixture(),original),p=new Memory();p.files.set(`shadow-paper-intake/${b.paperId}/set-1/legacy/file`,enc.encode('x'));await expect(stageShadowBundle(b,p)).rejects.toThrow(/Prior staging/);p.files.clear();await stageShadowBundle(b,p);p.row!.status='reviewed';await expect(stageShadowBundle(b,p)).rejects.toThrow(/already reviewed/);});

});
