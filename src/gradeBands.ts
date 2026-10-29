/** Pearson grade-performance columns displayed for each GCSE paper tier. */
const foundationGrades=[1,2,3,4,5] as const;
const higherGrades=[4,5,6,7,8,9] as const;
const allGrades=[1,2,3,4,5,6,7,8,9] as const;

export function gradesForTier(tier:string):readonly number[]{
 if(tier==="Foundation")return foundationGrades;
 if(tier==="Higher")return higherGrades;
 return allGrades;
}
