export type ExportMode = "questions"|"marks"|"both";
export type SavedAssessment = {
 id:string;name:string;ids:string[];minutes:number;folder:string;
 nameBox?:boolean;classBox?:boolean;paperTier?:string;paperCalc?:string;cover?:boolean;
 answers?:boolean;exportMode?:ExportMode;
};
type LegacyAssessment = Omit<SavedAssessment,"id"|"folder"> & {id?:string;folder?:string};
export const LIBRARY_KEY="mqb-draft-assessments";
export const FOLDERS_KEY="mqb-worksheet-folders";
export const DEFAULT_FOLDER="Unfiled";
export function normalizeAssessments(value:unknown):SavedAssessment[]{
 if(!Array.isArray(value))return [];
 const seen=new Set<string>();
 return value.flatMap((item,index)=>{
  if(!item||typeof item!=="object")return [];
  const a=item as Partial<LegacyAssessment>;
  if(typeof a.name!=="string"||!Array.isArray(a.ids))return [];
  let id=typeof a.id==="string"&&a.id.trim()?a.id:`legacy-${index}`;
  if(seen.has(id))id=`${id}-${index}`;
  seen.add(id);
  return [{
   id,name:a.name,ids:a.ids.filter((v):v is string=>typeof v==="string"),
   minutes:typeof a.minutes==="number"&&a.minutes>0?a.minutes:45,
   folder:typeof a.folder==="string"&&a.folder.trim()?a.folder:DEFAULT_FOLDER,
   nameBox:a.nameBox,classBox:a.classBox,paperTier:a.paperTier,paperCalc:a.paperCalc,
   cover:a.cover,answers:a.answers,exportMode:a.exportMode
  }];
 });
}
export function normalizeFolders(value:unknown,assessments:ReadonlyArray<SavedAssessment>):string[]{
 const names=Array.isArray(value)?value.filter((v):v is string=>typeof v==="string"&&!!v.trim()):[];
 return [...new Set([DEFAULT_FOLDER,...names,...assessments.map(a=>a.folder)])];
}
export function upsertAssessment(items:ReadonlyArray<SavedAssessment>,assessment:SavedAssessment):SavedAssessment[]{
 const index=items.findIndex(a=>a.id===assessment.id);
 if(index<0)return [...items,assessment];
 const next=[...items];next[index]=assessment;return next;
}
export function removeAssessment(items:ReadonlyArray<SavedAssessment>,id:string):SavedAssessment[]{
 return items.filter(a=>a.id!==id);
}
export function renameFolder(items:ReadonlyArray<SavedAssessment>,from:string,to:string):SavedAssessment[]{
 return items.map(a=>a.folder===from?{...a,folder:to}:a);
}
