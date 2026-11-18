import {expect,type Page} from "@playwright/test";
import {createCanvas,loadImage} from "@napi-rs/canvas";
import {numberingFixture} from "./numbering-fixture";

export const sourceWidth=1000,shortHeight=800,longHeight=2600;
// Original, clearly synthetic mathematics/layout. The source PDF used for
// comparison is inspected separately; no examination images enter this fixture.
const rect=(x:number,y:number,w:number,h:number,color:string)=>`<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${color}"/>`;
const frequencies=[4,8,12,16,14,6],cumulative=[4,12,24,40,54,60];
const table=(top:number,label:string,mark=false)=>{
 const cf=label.startsWith('Cumulative');
 return `<text x="180" y="${top-20}" font-size="25">${label}</text><path d="M180 ${top}h640v280H180zM500 ${top}v280${[40,80,120,160,200,240].map(d=>`M180 ${top+d}h640`).join('')}" fill="none" stroke="black" stroke-width="2"/><text x="200" y="${top+30}" font-size="23">Time (t minutes)</text><text x="520" y="${top+30}" font-size="23">${cf?'Cumulative frequency':'Frequency'}</text>${frequencies.map((f,i)=>`<text x="210" y="${top+70+i*40}" font-size="22">${i*20} &lt; t ≤ ${(i+1)*20}</text><text x="550" y="${top+70+i*40}" font-size="22">${cf?(mark?cumulative[i]:''):f}</text>`).join('')}`;
};
const graph=(top:number,height=700,plotted=false,short=false)=>{
 const values=short?[0,4,12,30,54,60]:[0,...cumulative],step=740/(values.length-1);
 const curve=values.map((v,i)=>`${130+i*step},${top+height-v/60*height}`).join(' ');
 return `${rect(130,top,740,height,'#d9f4ff')}<g stroke="#777" stroke-width="1">${Array.from({length:38},(_,i)=>`<path d="M${130+i*20} ${top}v${height}"/>`).join('')}${Array.from({length:Math.floor(height/20)+1},(_,i)=>`<path d="M130 ${top+i*20}h740"/>`).join('')}</g><path d="M130 ${top}v${height}h740" fill="none" stroke="black" stroke-width="3"/>${plotted?`<polyline points="${curve}" fill="none" stroke="black" stroke-width="4"/>`:''}<text x="20" y="${top+height/2}" font-size="23">CF</text><text x="360" y="${top+height+35}" font-size="23">${short?'Height (cm)':'Time (minutes)'}</text>${values.map((_,i)=>`<text x="${120+i*step}" y="${top+height+60}" font-size="20">${short?120+i*10:i*20}</text>`).join('')}${[0,10,20,30,40,50,60].map(v=>`<text x="90" y="${top+height-v/60*height+6}" font-size="20">${v}</text>`).join('')}`;
};
export function multipageSvg(kind:"short"|"long",mark=false,part=0,extra=false){
 const number=kind==='short'?8:11,h=kind==='short'?shortHeight:longHeight;
 const content=kind==='short'?`${rect(35,90,70,30,'#00c800')}<text x="130" y="110" font-size="26">${mark?'Short marking guidance: 6 students':'Read the cumulative frequency graph.'}</text>${graph(160,420,true,true)}<text x="130" y="680" font-size="26">Estimate the number above 160 cm.</text>`:part===1?`${rect(35,100,70,30,'#009999')}<text x="130" y="120" font-size="26">Additional source image: part (d)</text><text x="130" y="260" font-size="26">${mark?'Award 1 mark for a supported comparison.':'Compare the two estimates.'}</text>`:`${rect(35,90,70,30,'#00c800')}<text x="130" y="110" font-size="26">${mark?'Long marking guidance':'Grouped travel times for 60 people.'}</text>${table(180,'Frequency table')}<text x="130" y="485" font-size="26">(a) Complete the cumulative frequency table. (1)</text>${table(540,'Cumulative frequency table',mark)}<text x="130" y="1380" font-size="26">(b) Draw the cumulative frequency graph. (2)</text>${graph(1440,700,mark)}<text x="130" y="2260" font-size="26">(c) Estimate the percentage above 90 minutes. (${extra?2:3})</text>${mark?'<text x="580" y="2380" font-size="25">About 21.7%</text>':''}<path d="M580 2400h280" stroke="black"/>${rect(35,2460,70,30,'#0000ff')}`;
 const height=part===1?500:h;
 return `<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="${height}"><rect width="1000" height="${height}" fill="white"/><text x="30" y="42" font-size="30">${number}</text>${content}<text x="390" y="${height-35}" font-size="25">(Total for Question ${number} is ${kind==='short'?2:6} marks)</text></svg>`;
}
function row(id:string,number:number,marks:number,part=""){
 const height=part==='d'?500:number===8?shortHeight:longHeight;
 return {id,paper_id:`fixture-${number===8?'2017':'2019'}-2h`,question_number:`Q${number}${part}`,marks,topic:'Statistics',skill:'Cumulative frequency graphs',assessment_objective:'AO2',question_storage_path:`questions/${number}${part==='d'?'-extra':''}.svg`,mark_scheme_storage_path:`marks/${number}${part==='d'?'-extra':''}.svg`,exam_papers:{exam_board:'Edexcel',series:number===8?'June 2017':'June 2019',paper_code:'2H',tier:'Higher'},metadata:{id:`FIXTURE-${number===8?'2017':'2019'}-2H-Q${number}${part}`,tier:'Higher',calculator:true,numbering_positions:{question:numberingFixture(1000,height,number,{left:27,top:15,width:55,height:32},{left:385,top:height-59,width:575,height:33},number===8?2:6),mark:numberingFixture(1000,height,number,{left:27,top:15,width:55,height:32})}}};
}
export async function openMultipageFixture(page:Page,{mode="both",extra=false,raster=false}:{mode?:string;extra?:boolean;raster?:boolean}={}){
 const user={id:'11111111-1111-4111-8111-111111111111',aud:'authenticated',role:'authenticated',email:'owner@example.test',app_metadata:{provider:'email',providers:['email']},user_metadata:{},created_at:'2026-01-01T00:00:00Z'};
 const enc=(v:object)=>Buffer.from(JSON.stringify(v)).toString('base64url'),token=`${enc({alg:'HS256',typ:'JWT'})}.${enc({exp:4102444800,sub:user.id,role:'authenticated',aud:'authenticated'})}.signature`;
 const rows=[row('short',8,2),row('long-a',11,1,'a'),row('long-b',11,2,'b'),row('long-c',11,extra?2:3,'c'),...(extra?[row('long-d',11,1,'d')]:[])];
 await page.addInitScript(({user,token})=>localStorage.setItem('sb-ljisttslifnyrbuybfud-auth-token',JSON.stringify({user,access_token:token,refresh_token:'fixture',expires_at:4102444800,expires_in:999999999,token_type:'bearer'})),{user,token});
 let writes=0;
 await page.route('https://ljisttslifnyrbuybfud.supabase.co/**',async route=>{
  const path=new URL(route.request().url()).pathname;
  const reply=(v:unknown)=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(v)});
  if(path==='/auth/v1/user')return reply(user);
  if(path.startsWith('/rest/v1/profiles'))return reply([{role:'owner',approved:true}]);
  if(path.startsWith('/rest/v1/questions'))return reply(rows);
  if(path.startsWith('/rest/v1/assessment_folders'))return reply([]);
  if(path.startsWith('/rest/v1/assessment_questions'))return reply(rows.map((r,i)=>({assessment_id:'saved-layout',question_id:r.id,position:i})));
  if(path.startsWith('/rest/v1/assessments'))return reply([{id:'saved-layout',title:'Synthetic cumulative frequency layout fixture',created_at:'2026-11-18T10:00:00Z',revision:1,configuration:{id:'layout',folder:'Unfiled',minutes:20,cover:false,nameBox:false,exportMode:mode,renumberStudentQuestions:true}}]);
  if(path.includes('/storage/v1/object/sign/'))return reply(route.request().postDataJSON().paths.map((path:string)=>({path,signedURL:`/multipage-fixture.svg?asset=${encodeURIComponent(path)}`})));
  if(route.request().method()!=='GET')writes++;
  return reply([]);
 });
 const rasterCache=new Map<string,Buffer>();
 await page.route('**/multipage-fixture.svg?**',async route=>{
  const asset=decodeURIComponent(new URL(route.request().url()).searchParams.get('asset')||'');
  const svg=multipageSvg(asset.includes('11')?'long':'short',asset.startsWith('marks/'),asset.includes('-extra')?1:0,extra);
  if(!raster)return route.fulfill({status:200,contentType:'image/svg+xml',headers:{'access-control-allow-origin':'*'},body:svg});
  if(!rasterCache.has(asset)){const img=await loadImage(Buffer.from(svg)),canvas=createCanvas(img.width,img.height);canvas.getContext('2d').drawImage(img,0,0);rasterCache.set(asset,canvas.toBuffer('image/png'));}
  return route.fulfill({status:200,contentType:'image/png',headers:{'access-control-allow-origin':'*'},body:rasterCache.get(asset)!});
 });
 await page.goto('/');await page.getByRole('navigation',{name:'Main navigation'}).getByRole('button',{name:'My Worksheets',exact:true}).click();await page.getByRole('button',{name:'Open / Edit',exact:true}).click();
 await expect(page.getByRole('heading',{name:'Assessment preview',exact:true})).toBeVisible();
 await expect(page.getByRole('button',{name:/Print .*save PDF/})).toBeEnabled();
 return {writes:()=>writes,rows};
}
