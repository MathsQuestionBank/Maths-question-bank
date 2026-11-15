import { stableImageUrl } from "./imageIdentity";
import type { Crop } from "./CropEditor";

/** Dimensions are percentages of the cropped image's width. This keeps covers
 * predictable on both short questions and full-page exam images. A saved cover
 * is a proposal until a teacher reviews it against that particular image/crop.
 */
export type NumberingMask = {
 numberWidth:number;numberHeight:number;footerHeight:number;
 numberTop?:number;numberLeft?:number;footerBottom?:number;footerWidth?:number;footerLeft?:number;
 numberEnabled?:boolean;footerEnabled?:boolean;reviewedFor?:string;imageHash?:string;
};

export const defaultNumberingMask:NumberingMask={numberWidth:3.5,numberHeight:3.5,footerHeight:2.8,numberTop:0,numberLeft:0,footerBottom:0,footerWidth:55,footerLeft:45,numberEnabled:true,footerEnabled:true};
const percent=(value:unknown,fallback:number,max=100)=>typeof value==="number"&&Number.isFinite(value)?Math.max(0,Math.min(max,value)):fallback;

export function normaliseNumberingMask(input:unknown):NumberingMask {
 const value=input&&typeof input==="object"?input as Partial<NumberingMask>:{};
 const numberWidth=percent(value.numberWidth,3.5,25),footerWidth=percent(value.footerWidth,55);
 return {
  numberWidth,numberHeight:percent(value.numberHeight,3.5,25),footerHeight:percent(value.footerHeight,2.8,25),
  numberTop:percent(value.numberTop,0,200),numberLeft:percent(value.numberLeft,0,100-numberWidth),
  footerBottom:percent(value.footerBottom,0,200),footerWidth,footerLeft:percent(value.footerLeft,100-footerWidth,100-footerWidth),
  numberEnabled:value.numberEnabled!==false,footerEnabled:value.footerEnabled!==false,
  ...(typeof value.reviewedFor==="string"?{reviewedFor:value.reviewedFor}:{}),
  ...(typeof value.imageHash==="string"&&/^[a-f0-9]{64}$/.test(value.imageHash)?{imageHash:value.imageHash}:{})
 };
}

export function normaliseNumberingMasks(input:unknown):Record<string,NumberingMask> {
 if(!input||typeof input!=="object"||Array.isArray(input))return {};
 return Object.fromEntries(Object.entries(input).filter(([,value])=>value!==null&&typeof value==="object"&&!Array.isArray(value)).map(([key,value])=>[key,normaliseNumberingMask(value)]));
}
export const normalizeNumberingMasks=normaliseNumberingMasks;

function imageIdentity(src:string):string {
 // Signed storage links are refreshed during a planning session. Expiring tokens
 // must not discard an otherwise valid review; a different file must do so.
 if(!src.startsWith("data:"))return stableImageUrl(src);
 // Keep embedded fixture images out of saved assessment JSON.
 let hash=2166136261;
 for(let i=0;i<src.length;i++)hash=Math.imul(hash^src.charCodeAt(i),16777619);
 return `embedded:${src.length}:${hash>>>0}`;
}

export function numberingMaskReviewKey(mask:unknown,src:string,crop:Crop,coverOriginalFooter=true):string {
 const {reviewedFor:_,imageHash:__,...geometry}=normaliseNumberingMask(mask);
 return "mqb-mask-v1:"+JSON.stringify([imageIdentity(src),[crop.top,crop.right,crop.bottom,crop.left],geometry,coverOriginalFooter]);
}

export function isNumberingMaskReviewed(mask:unknown,src:string,crop:Crop,coverOriginalFooter=true):boolean {
 const value=normaliseNumberingMask(mask);
 return !!src&&value.reviewedFor===numberingMaskReviewKey(value,src,crop,coverOriginalFooter);
}

/** Call only after the teacher has checked the image with visible cover guides. */
export function reviewNumberingMask(mask:unknown,src:string,crop:Crop,coverOriginalFooter=true):NumberingMask {
 const value=normaliseNumberingMask(mask);
 return {...value,reviewedFor:numberingMaskReviewKey(value,src,crop,coverOriginalFooter)};
}
