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
