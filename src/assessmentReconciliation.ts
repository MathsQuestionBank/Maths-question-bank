import type { SavedAssessment } from "./worksheetLibrary";

export type CloudSnapshot = {
 cloudId:string;
 item:SavedAssessment & { originBrowserId?: string };
 createdAt:string;
};

/** Stable signature excludes browser/cloud-generated IDs and presentation-only names. */
export function assessmentSignature(item:SavedAssessment):string {
 return JSON.stringify({
  name:item.name,folder:item.folder,ids:item.ids,minutes:item.minutes,
  nameBox:item.nameBox??true,classBox:item.classBox??false,
  paperTier:item.paperTier??"Any",paperCalc:item.paperCalc??"Any",
  cover:item.cover??true,exportMode:item.exportMode??(item.answers?"both":"questions")
 });
}

export type Reconciliation = {
 cloud:CloudSnapshot[];
 browserOnly:SavedAssessment[];
 conflicts:{browser:SavedAssessment;cloud:CloudSnapshot}[];
 alreadySynced:SavedAssessment[];
};

/** Read-only reconciliation. Never overwrites local or remote records. */
export function reconcileAssessments(browser:SavedAssessment[],cloud:CloudSnapshot[]):Reconciliation {
 const browserOnly:SavedAssessment[]=[];
 const conflicts:Reconciliation["conflicts"]=[];
 const alreadySynced:SavedAssessment[]=[];
 for(const local of browser) {
  const sameOrigin=cloud.find(remote=>remote.item.originBrowserId===local.id);
  const sameContent=cloud.find(remote=>assessmentSignature(remote.item)===assessmentSignature(local));
  if(sameOrigin) {
   if(assessmentSignature(sameOrigin.item)===assessmentSignature(local)) alreadySynced.push(local);
   else conflicts.push({browser:local,cloud:sameOrigin});
  } else if(sameContent) alreadySynced.push(local);
  else browserOnly.push(local);
 }
 return {cloud,browserOnly,conflicts,alreadySynced};
}
