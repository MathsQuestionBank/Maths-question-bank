import {it,expect,vi} from "vitest";
const {range,query}=vi.hoisted(()=>{const range=vi.fn();const query={select:vi.fn(),order:vi.fn(),range};return {range,query};});
vi.mock("./supabase",()=>({supabase:{auth:{getSession:async()=>({data:{session:{}}})},from:()=>query}}));
import {loadBankQuestions} from "./questionData";
it("loads older rows beyond the first thousand without altering review status",async()=>{
 query.select.mockReturnValue(query);query.order.mockReturnValue(query);
 const row=(id:number)=>({id:String(id),metadata:{image_status:"not_uploaded",crop_review:{mark:"approved"}},question_storage_path:"q",mark_scheme_storage_path:"m"});
 range.mockResolvedValueOnce({data:Array.from({length:1000},(_,i)=>row(i))}).mockResolvedValueOnce({data:[row(1000)]});
 const result=await loadBankQuestions();
 expect(range.mock.calls).toEqual([[0,999],[1000,1999]]);
 expect(result).toHaveLength(1001);expect(result[1000]).toMatchObject({id:"1000",imagePending:false,cropReview:{question:"unreviewed",mark:"approved"}});
});
