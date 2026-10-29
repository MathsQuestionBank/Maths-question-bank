import {describe,expect,it,vi} from "vitest";
import JSZip from "jszip";
import {buildReviewerPack} from "./reviewerPack";

const owner="7f928734-090f-4ffe-9f91-f3950b478b05";
const folder="new-paper-intake/Edexcel/GCSE-Mathematics/June-2017/2F/"+owner;
const source={path:folder,board:"Edexcel",qualification:"GCSE-Mathematics",series:"June-2017",code:"2F"};
const saved={version:1,mappingFile:"2017-Foundation-Enhanced.csv",items:[
 {number:1,approved:false,question:{page:2,top:.1,bottom:.5},mark:{page:5,top:.2,bottom:.6}},
 {number:2,approved:true,question:{page:2,top:.5,bottom:.8},mark:{page:5,top:.6,bottom:.9}}
]};
const load=vi.fn(async(path:string)=>{
 if(path.endsWith("extraction-review.json"))return new Blob([JSON.stringify(saved)]);
 if(path.endsWith(".pdf"))return new Blob(["%PDF-1.4 mocked document"],{type:"application/pdf"});
 if(path.endsWith(".csv"))return new Blob(["Question ID,Grade 1 success percent\nQ01,90"]);
 throw Error("Unexpected path: "+path);
});

describe("private paper reviewer pack",()=>{
 it("bundles existing PDFs, mapping, review and manifest without changing server state",async()=>{
  load.mockClear();
  const result=await buildReviewerPack(source,owner,load);
  expect(result.filename).toBe("MQB-Review-Edexcel-June-2017-2F.zip");
  expect(result.questions).toBe(2);expect(result.approved).toBe(1);
  expect(load.mock.calls.map(call=>call[0])).toEqual([
   folder+"/extraction-review.json",folder+"/question-paper.pdf",folder+"/mark-scheme.pdf",
   "enhanced-mapping-intake/"+owner+"/2017-Foundation-Enhanced.csv"
  ]);
  const zip=await JSZip.loadAsync(await result.blob.arrayBuffer());
  const names=Object.keys(zip.files);
  expect(names).toEqual(expect.arrayContaining(["question-paper.pdf","mark-scheme.pdf","2017-Foundation-Enhanced.csv","extraction-review.json","review-manifest.json","README.txt"]));
  expect(JSON.parse(await zip.file("extraction-review.json")!.async("string"))).toEqual(saved);
  expect(JSON.parse(await zip.file("review-manifest.json")!.async("string"))).toMatchObject({board:"Edexcel",series:"June-2017",code:"2F",completeQuestions:2,approvedQuestions:1});
 });
 it("blocks someone else's archive path before any download",async()=>{
  load.mockClear();
  await expect(buildReviewerPack(source,"11111111-1111-4111-8111-111111111111",load)).rejects.toThrow(/signed-in account/);
  expect(load).not.toHaveBeenCalled();
 });
 it("does not include an invalid or dangerous mapping filename",async()=>{
  const bad={...saved,mappingFile:"../../other-account/private.csv"};
  const mock=vi.fn().mockResolvedValue(new Blob([JSON.stringify(bad)]));
  await expect(buildReviewerPack(source,owner,mock)).rejects.toThrow(/invalid or incomplete/);
  expect(mock).toHaveBeenCalledTimes(1);
 });
});
