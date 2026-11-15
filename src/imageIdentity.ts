/** Keep content selectors while ignoring refreshed signing credentials. */
export function stableImageUrl(src:string):string {
 if(/^(?:data|blob):/i.test(src))return src;
 try{
  const url=new URL(src,"https://mqb.local");
  for(const name of [...url.searchParams.keys()]){
   if(/^(?:token|signature|expires|expires_at|expires_in|x-amz-.+|x-goog-.+)$/i.test(name))url.searchParams.delete(name);
  }
  url.searchParams.sort();
  return url.origin+url.pathname+url.search+url.hash;
 }catch{return src}
}
