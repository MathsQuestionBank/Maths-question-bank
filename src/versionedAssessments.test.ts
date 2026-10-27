import {beforeEach,describe,expect,it,vi} from "vitest";
const {getUser,rpc}=vi.hoisted(()=>({getUser:vi.fn(),rpc:vi.fn()}));
vi.mock("./supabase",()=>({supabase:{auth:{getUser},rpc}}));
import {saveVersionedAssessment,deleteVersionedAssessment} from "./versionedAssessments";
const item={id:"local-1",name:"GCSE Assessment",ids:["a","b"],minutes:45,folder:"Year 11"};
describe("versioned cloud assessment writes",()=>{
 beforeEach(()=>{vi.clearAllMocks();getUser.mockResolvedValue({data:{user:{id:"u1"}},error:null})});
 it("uses a single atomic RPC for updates with expected revision",async()=>{
  rpc.mockResolvedValue({data:[{saved_id:"assessment-1",saved_revision:8}],error:null});
  await expect(saveVersionedAssessment(item,{cloudId:"assessment-1",revision:7})).resolves.toEqual({cloudId:"assessment-1",revision:8});
  expect(rpc).toHaveBeenCalledWith("save_owned_assessment",expect.objectContaining({p_id:"assessment-1",p_expected_revision:7,p_question_ids:["a","b"]}));
 });
 it("does not issue a write without authentication",async()=>{
  getUser.mockResolvedValue({data:{user:null},error:null});
  await expect(saveVersionedAssessment(item)).rejects.toThrow("sign in");
  expect(rpc).not.toHaveBeenCalled();
 });
 it("reports conflicting edits without retrying or overwriting",async()=>{
  rpc.mockResolvedValue({data:null,error:{code:"40001",message:"conflict"}});
  await expect(saveVersionedAssessment(item,{cloudId:"assessment-1",revision:1})).rejects.toThrow("another device");
  expect(rpc).toHaveBeenCalledTimes(1);
 });
 it("requires version confirmation for deletes",async()=>{
  rpc.mockResolvedValue({data:true,error:null});
  await deleteVersionedAssessment("assessment-1",3);
  expect(rpc).toHaveBeenCalledWith("delete_owned_assessment",{p_id:"assessment-1",p_expected_revision:3});
 });
});
