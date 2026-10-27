export type ExportMode="questions"|"marks"|"both";
export type SavedAssessment={
 id:string;name:string;ids:string[];minutes:number;folder:string;
 nameBox?:boolean;classBox?:boolean;paperTier?:string;paperCalc?:string;cover?:boolean;answers?:boolean;exportMode?:ExportMode;
};
export type LegacyAssessment=Omit<SavedAssessment,"id"|"folder">&{id?:string;folder?:string};
export const ASSESSMENTS_KEY="mqb-draft-assessments";
export const FOLDERS_KEY="mqb-worksheet-folders";
export function normaliseAssessments(input:unknown):SavedAssessment[]{
 if(!Array.isArray(input))return [];
 return input.flatMap((item,index)=>{
  if(!item||typeof item!=="object")return [];
  const a=item as Partial<LegacyAssessment>;
  if(!Array.isArray(a.ids)||!a.ids.every(x=>typeof x==="string"))return [];
  return [{
   ...a,id:typeof a.id==="string"&&a.id?a.id:`legacy-${index}`,
   folder:typeof a.folder==="string"&&a.folder.trim()?a.folder.trim():"Unfiled",
   name:typeof a.name==="string"&&a.name?a.name:"Untitled assessment",
   ids:[...a.ids],minutes:typeof a.minutes==="number"&&Number.isFinite(a.minutes)?a.minutes:45
  } as SavedAssessment];
 });
}
export function replaceAssessment(saved:SavedAssessment[],next:SavedAssessment):SavedAssessment[]{
 const index=saved.findIndex(a=>a.id===next.id);
 if(index<0)return [...saved,next];
 return saved.map(a=>a.id===next.id?next:a);
}
export function removeAssessment(saved:SavedAssessment[],id:string):SavedAssessment[]{return saved.filter(a=>a.id!==id)}
export function moveAssessmentToFolder(saved:SavedAssessment[],id:string,folder:string):SavedAssessment[]{
 return saved.map(a=>a.id===id?{...a,folder}:a);
}
export function renameAssessment(saved:SavedAssessment[],id:string,name:string):SavedAssessment[]{
 return saved.map(a=>a.id===id?{...a,name:name.trim()||a.name}:a);
}

export type WorksheetBackup={format:"maths-question-bank-worksheets";version:1;exportedAt:string;assessments:SavedAssessment[];folders:string[]};
export function makeWorksheetBackup(assessments:SavedAssessment[],folders:string[],exportedAt:string):WorksheetBackup{
 return {format:"maths-question-bank-worksheets",version:1,exportedAt,assessments:normaliseAssessments(assessments),folders:[...folders]};
}

export function parseWorksheetBackup(input:unknown):WorksheetBackup{
 if(!input||typeof input!=="object")throw new Error("Not a Maths Question Bank backup.");
 const b=input as Partial<WorksheetBackup>;
 if(b.format!=="maths-question-bank-worksheets"||b.version!==1||!Array.isArray(b.assessments)||!Array.isArray(b.folders))throw new Error("Unsupported or invalid backup file.");
 if(b.assessments.length>5000||b.folders.length>1000)throw new Error("Backup is too large.");
 if(!b.assessments.every(a=>a&&typeof a==="object"&&typeof a.id==="string"&&a.id.length>0&&typeof a.name==="string"&&Array.isArray(a.ids)&&a.ids.length<=500&&a.ids.every(id=>typeof id==="string"&&id.length>0)&&typeof a.minutes==="number"&&Number.isFinite(a.minutes)&&a.minutes>0&&typeof a.folder==="string"))throw new Error("Backup has invalid assessment records.");
 if(!b.folders.every(x=>typeof x==="string"&&x.trim().length>0))throw new Error("Backup has invalid folders.");
 return {format:"maths-question-bank-worksheets",version:1,exportedAt:typeof b.exportedAt==="string"?b.exportedAt:"",assessments:normaliseAssessments(b.assessments),folders:b.folders};
}
export function mergeWorksheetBackup(existing:SavedAssessment[],existingFolders:string[],backup:WorksheetBackup):{assessments:SavedAssessment[];folders:string[];added:number}{
 const usedIds=new Set(existing.map(a=>a.id));
 let counter=0;
 const incoming=backup.assessments.map(a=>{
  let id=a.id;
  while(usedIds.has(id)){id=`restored-${++counter}-${a.id}`;}
  usedIds.add(id);
  return {...a,id,ids:[...a.ids]};
 });
 const folders=[...existingFolders];
 for(const folder of [...backup.folders,...incoming.map(a=>a.folder)]){
  const cleaned=folder.trim();
  if(cleaned==="Unfiled"||cleaned==="All"||!cleaned)continue;
  if(!folders.some(x=>x.toLowerCase()===cleaned.toLowerCase()))folders.push(cleaned);
 }
 return {assessments:[...existing,...incoming],folders,added:incoming.length};
}
