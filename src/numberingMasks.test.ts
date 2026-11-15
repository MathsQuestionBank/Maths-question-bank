import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { CroppedImage, type Crop } from "./CropEditor";
import { defaultNumberingMask, isNumberingMaskReviewed, normaliseNumberingMask, normaliseNumberingMasks, reviewNumberingMask } from "./numberingMasks";

const crop:Crop={top:2,right:3,bottom:4,left:5};
const src="https://example.supabase.co/storage/v1/object/sign/exam/paper/q17.png?token=first";

describe("assessment-local numbering cover review",()=>{
 it("does not trust suggested or legacy cover geometry without a teacher review",()=>{
  for(const mask of [undefined,defaultNumberingMask,{numberWidth:12,numberHeight:8,footerHeight:11}]){
   expect(isNumberingMaskReviewed(mask,src,crop)).toBe(false);
  }
 });
 it("keeps reviews through expiring image links and saved assessment round trips",()=>{
  const reviewed=reviewNumberingMask(defaultNumberingMask,src,crop);
  const reopened=normaliseNumberingMasks(JSON.parse(JSON.stringify({question:reviewed}))).question;
  expect(isNumberingMaskReviewed(reopened,src.replace("token=first","token=refreshed"),crop)).toBe(true);
 });
 it("invalidates a review when the source image or crop changes",()=>{
  const reviewed=reviewNumberingMask(defaultNumberingMask,src,crop);
  expect(isNumberingMaskReviewed(reviewed,src.replace("q17.png","q18.png"),crop)).toBe(false);
  expect(isNumberingMaskReviewed(reviewed,src,{...crop,left:6})).toBe(false);
  expect(isNumberingMaskReviewed(reviewed,"",crop)).toBe(false);
 });
 it("requires a new review when the footer-cover export option changes",()=>{
  const reviewedWithoutFooter=reviewNumberingMask(defaultNumberingMask,src,crop,false);
  expect(isNumberingMaskReviewed(reviewedWithoutFooter,src,crop,false)).toBe(true);
  expect(isNumberingMaskReviewed(reviewedWithoutFooter,src,crop,true)).toBe(false);
  const reviewedWithFooter=reviewNumberingMask(defaultNumberingMask,src,crop,true);
  expect(isNumberingMaskReviewed(reviewedWithFooter,src,crop,false)).toBe(false);
 });
 it("invalidates reviewed masks after any geometry or enablement adjustment",()=>{
  const reviewed=reviewNumberingMask(defaultNumberingMask,src,crop);
  const changes={numberWidth:4,numberHeight:5,numberTop:7,numberLeft:8,footerHeight:6,footerBottom:4,footerWidth:40,footerLeft:10,numberEnabled:false,footerEnabled:false};
  for(const [key,value] of Object.entries(changes)){
   expect(isNumberingMaskReviewed({...reviewed,[key]:value},src,crop),key).toBe(false);
  }
 });
 it("supports a reviewed image with either or both original-print covers disabled",()=>{
  const reviewed=reviewNumberingMask({...defaultNumberingMask,numberEnabled:false,footerEnabled:false},src,crop);
  expect(isNumberingMaskReviewed(reviewed,src,crop)).toBe(true);
  expect(reviewed.numberEnabled).toBe(false);
  expect(reviewed.footerEnabled).toBe(false);
 });
 it("sanitizes malformed persisted geometry and keeps covers within horizontal bounds",()=>{
  const mask=normaliseNumberingMask({numberWidth:200,numberHeight:-5,numberLeft:99,numberTop:Infinity,footerHeight:NaN,footerWidth:200,footerLeft:35,footerBottom:500,numberEnabled:false,reviewedFor:4});
  expect(mask).toMatchObject({numberWidth:25,numberHeight:0,numberLeft:75,numberTop:0,footerHeight:2.8,footerWidth:100,footerLeft:0,footerBottom:200,numberEnabled:false});
  expect(mask.reviewedFor).toBeUndefined();
  expect(normaliseNumberingMasks([defaultNumberingMask])).toEqual({});
  expect(normaliseNumberingMasks({bad:null,array:[],ok:{numberWidth:8}})).toEqual({ok:normaliseNumberingMask({numberWidth:8})});
 });
 it("keeps legacy footer widths right-aligned until a teacher chooses a horizontal position",()=>{
  expect(normaliseNumberingMask({numberWidth:3.5,numberHeight:3.5,footerHeight:2.8,footerWidth:70}).footerLeft).toBe(30);
 });
});

describe("reviewed content selectors",()=>{
 it("requires review again for a different query-selected page but preserves refreshed credentials",()=>{
  const first="https://images.test/page.png?page=1&token=old";
  const mask=reviewNumberingMask(defaultNumberingMask,first,crop);
  expect(isNumberingMaskReviewed(mask,"https://images.test/page.png?token=new&page=1",crop)).toBe(true);
  expect(isNumberingMaskReviewed(mask,"https://images.test/page.png?page=2&token=new",crop)).toBe(false);
 });
});

describe("cropped image cover safety",()=>{
 const render=(mask=defaultNumberingMask,guides=false)=>renderToStaticMarkup(createElement(CroppedImage,{src,crop,alt:"Question 1",coverOriginalNumber:true,coverOriginalFooter:true,numberingMask:mask,showCoverGuides:guides}));
 it("never silently renders opaque default covers over potential mathematical content",()=>{
  expect(render()).not.toContain("mqb-original-number-mask");
  expect(render()).not.toContain("mqb-original-total-mask");
 });
 it("shows translucent covers while the teacher checks for overlap",()=>{
  const markup=render(defaultNumberingMask,true);
  expect(markup).toContain("mqb-original-number-mask is-adjusting");
  expect(markup).toContain("rgba(255,196,0,.25)");
 });
 it("renders only the covers explicitly enabled in a valid reviewed configuration",()=>{
  const markup=render(reviewNumberingMask({...defaultNumberingMask,footerEnabled:false},src,crop));
  expect(markup).toContain("mqb-original-number-mask");
  expect(markup).not.toContain("mqb-original-total-mask");
 });
 it("refuses stale reviewed covers after a crop adjustment",()=>{
  expect(render(reviewNumberingMask(defaultNumberingMask,src,{...crop,top:3}))).not.toContain("mqb-original-number-mask");
 });
 it("does not start masking an unpreviewed footer after its export option is enabled",()=>{
  const withoutFooter=reviewNumberingMask(defaultNumberingMask,src,crop,false);
  expect(render(withoutFooter)).not.toContain("mqb-original-total-mask");
  expect(render(withoutFooter)).not.toContain("mqb-original-number-mask");
 });
});
