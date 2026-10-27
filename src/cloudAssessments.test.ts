import { beforeEach, describe, expect, it, vi } from "vitest";

const {getUser,from}=vi.hoisted(()=>({
 getUser:vi.fn(),
 from:vi.fn(),
}));
vi.mock("./supabase",()=>({supabase:{auth:{getUser},from}}));
import { getCloudAssessments, saveCloudAssessment } from "./cloudAssessments";

const sample={id:"browser-1",name:"Test",ids:["8bd21615-248c-4c8b-a6de-22b12cb53b88"],minutes:45,folder:"Unfiled"};

describe("V1.3 cloud assessment safety",()=>{
 beforeEach(()=>{vi.clearAllMocks();getUser.mockResolvedValue({data:{user:{id:"user-1"}},error:null})});
 it("requires sign-in and makes no database writes without a session",async()=>{
  getUser.mockResolvedValue({data:{user:null},error:null});
  await expect(saveCloudAssessment(sample)).rejects.toThrow("Sign in");
  expect(from).not.toHaveBeenCalled();
 });
 it("creates a separate assessment and ordered links, never upserts",async()=>{
  const single=vi.fn().mockResolvedValue({data:{id:"cloud-1"},error:null});
  const select=vi.fn().mockReturnValue({single});
  const insertAssessments=vi.fn().mockReturnValue({select});
  const insertQuestions=vi.fn().mockResolvedValue({error:null});
  from.mockImplementation((name:string)=>name==="assessments"?{insert:insertAssessments}:{insert:insertQuestions});
  await expect(saveCloudAssessment(sample)).resolves.toBe("cloud-1");
  expect(insertAssessments).toHaveBeenCalledWith(expect.objectContaining({created_by:"user-1",title:"Test"}));
  expect(insertQuestions).toHaveBeenCalledWith([{assessment_id:"cloud-1",question_id:sample.ids[0],position:0}]);
  expect(from).toHaveBeenCalledTimes(2);
 });
 it("does not write duplicate question references",async()=>{
  await expect(saveCloudAssessment({...sample,ids:[sample.ids[0],sample.ids[0]]})).rejects.toThrow("duplicate");
  expect(from).not.toHaveBeenCalled();
 });
 it("loads only owner rows with question order preserved",async()=>{
  const order=vi.fn().mockResolvedValueOnce({data:[{id:"cloud-1",title:"Cloud",configuration:{minutes:60,folder:"Year 11"},created_at:"2026-10-27"}],error:null}).mockResolvedValueOnce({data:[{assessment_id:"cloud-1",question_id:"q2",position:1},{assessment_id:"cloud-1",question_id:"q1",position:0}],error:null});
  const eq=vi.fn().mockReturnValue({order});
  const select=vi.fn().mockReturnValue({eq,in:vi.fn().mockReturnValue({order})});
  from.mockReturnValue({select});
  const rows=await getCloudAssessments();
  expect(eq).toHaveBeenCalledWith("created_by","user-1");
  expect(rows[0].item.ids).toEqual(["q1","q2"]);
  expect(rows[0].item.name).toBe("Cloud");
 });
});
