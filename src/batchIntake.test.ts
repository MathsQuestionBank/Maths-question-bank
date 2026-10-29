import {beforeEach,it,expect,vi} from 'vitest';
const mock=vi.hoisted(()=>({getUser:vi.fn(),rpc:vi.fn(),lookup:vi.fn(),list:vi.fn(),upload:vi.fn(),download:vi.fn()}));
vi.mock('./supabase',()=>{const query={select:()=>query,eq:()=>query,ilike:()=>query,limit:mock.lookup};return {supabase:{auth:{getUser:mock.getUser},rpc:mock.rpc,from:()=>query,storage:{from:()=>({list:mock.list,upload:mock.upload,download:mock.download})}}}});
import {archiveIntakeBatch,type IntakeBatch} from './batchIntake';
const batch=():IntakeBatch=>({mapping:new Blob(['csv']),mappingName:'mapping.csv',papers:[1,2].map(n=>({board:'Edexcel',qualification:'GCSE Mathematics',tier:'Foundation',series:'November 2021',code:n+'F',question:new Blob(['%PDF- question']),mark:new Blob(['%PDF- mark']),review:{version:1,mappingFile:'mapping.csv',items:[]}}))});
beforeEach(()=>{vi.resetAllMocks();mock.getUser.mockResolvedValue({data:{user:{id:'owner'}}});mock.rpc.mockResolvedValue({data:true});mock.lookup.mockResolvedValue({data:[]});mock.list.mockResolvedValue({data:[]});mock.upload.mockResolvedValue({error:null})});
it('requires owner access before any write',async()=>{mock.rpc.mockResolvedValue({data:false});await expect(archiveIntakeBatch(batch(),vi.fn())).rejects.toThrow(/owner/);expect(mock.upload).not.toHaveBeenCalled()});
it('skips published papers and existing reviews, including their source files',async()=>{
 mock.lookup.mockResolvedValueOnce({data:[{id:'published'}]}).mockResolvedValueOnce({data:[]});mock.list.mockResolvedValue({data:[{name:'extraction-review.json'}]});
 const results=await archiveIntakeBatch(batch(),vi.fn());expect(results[0]).toContain('already published');expect(results[1]).toContain('existing review retained');expect(mock.upload).toHaveBeenCalledTimes(1);
});
it('stages all papers privately without overwriting or calling publication',async()=>{
 const result=await archiveIntakeBatch(batch(),vi.fn());expect(result.every(x=>x.includes('0 approved'))).toBe(true);
 expect(mock.upload).toHaveBeenCalledTimes(9);for(const [path,,options] of mock.upload.mock.calls){expect(options.upsert).toBe(false);expect(path).not.toContain('published-papers')}
 expect(mock.rpc.mock.calls.map(x=>x[0])).toEqual(['is_approved_owner']);
});
it('retains different existing sources and continues other papers',async()=>{
 mock.upload.mockImplementation(async(path:string)=>path.includes('/1F/')?{error:{statusCode:'409',message:'already exists'}}:{error:null});mock.download.mockResolvedValue({data:new Blob(['different source'])});
 const result=await archiveIntakeBatch(batch(),vi.fn());expect(result[0]).toContain('Different existing source retained');expect(result[1]).toContain('0 approved');expect(mock.upload.mock.calls.filter(([p])=>p.includes('/1F/'))).toHaveLength(1);
});
