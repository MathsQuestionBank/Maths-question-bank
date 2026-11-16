/** Display conventions only; these are student-result groups, not question grades. */
const foundationGrades=[1,2,3,4,5] as const;
const higherGrades=[4,5,6,7,8,9] as const;
export const studentGrades=[1,2,3,4,5,6,7,8,9] as const;

export function gradesForTier(tier:string):readonly number[]{
 if(tier==="Foundation")return foundationGrades;
 if(tier==="Higher")return higherGrades;
 return studentGrades;
}

/** Include any additional reported groups; never discard stored performance by tier. */
export function performanceGrades(parts:ReadonlyArray<{gradePerformance:Record<number,number|null>}>,tier:string):number[]{
 return studentGrades.filter(grade=>gradesForTier(tier).includes(grade)||parts.some(part=>typeof part.gradePerformance[grade]==="number"));
}
