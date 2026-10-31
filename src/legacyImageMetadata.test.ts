import {describe,it,expect} from "vitest";
import {reconcileLegacyImageMetadata,metadataWithChangedCrop} from "./legacyImageMetadata";
describe("legacy image reconciliation",()=>{
 it("treats attached legacy images as present without granting approval",()=>{
  const original={image_status:"not_uploaded",crop_review:{mark:"approved"},other:42};
  const result=reconcileLegacyImageMetadata(original,"q.png","m.png");
  expect(result).toEqual({other:42,crop_review:{question:"unreviewed",mark:"approved"}});
  expect(original.image_status).toBe("not_uploaded");
  expect(reconcileLegacyImageMetadata(result,"q.png","m.png")).toEqual(result);
 });
 it("does not conceal missing attachments or existing needs-fix decisions",()=>{
  expect(reconcileLegacyImageMetadata({image_status:"not_uploaded",crop_review:{question:"needs-fix"}},"q",null)).toMatchObject({image_status:"not_uploaded",crop_review:{question:"needs-fix",mark:"unreviewed"}});
 });
 it("invalidates only the changed crop approval and retains other metadata",()=>{
  const next=metadataWithChangedCrop({image_status:"reviewed",crop_review:{question:"approved",mark:"approved"},image_crops:{question:{top:1}},tags:["geometry"]},"mark",{top:2});
  expect(next).toEqual({crop_review:{question:"approved",mark:"unreviewed"},image_crops:{question:{top:1},mark:{top:2}},tags:["geometry"]});
 });
});
