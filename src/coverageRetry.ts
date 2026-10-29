/** Recover from a short-lived Supabase pool saturation without retrying permission errors. */
export function isTransientCoverageConnectionError(error:unknown):boolean {
 const obj=error&&typeof error==="object"?error as {message?:unknown;code?:unknown;details?:unknown}:null;
 const message=[obj?.message,obj?.code,obj?.details,typeof error==="string"?error:""]
  .filter((part):part is string=>typeof part==="string").join(" ").toLowerCase();
 return /too many connections|too many clients|remaining connection slots|connection limit|connection pool|pool timeout|maxclientsinsessionmode|pgrst003|\b53300\b/.test(message);
}

/** One initial attempt plus at most two delayed retries. */
export async function withCoverageRetry<T>(
 request:()=>Promise<T>,
 wait:(milliseconds:number)=>Promise<void>=(milliseconds)=>new Promise(resolve=>setTimeout(resolve,milliseconds)),
 shouldContinue:()=>boolean=()=>true
):Promise<T>{
 for(let attempt=0;;attempt++){
  try{return await request()}
  catch(error){
   if(attempt>=2||!isTransientCoverageConnectionError(error)||!shouldContinue())throw error;
   await wait(attempt===0?500:1200);
   if(!shouldContinue())throw error;
  }
 }
}
