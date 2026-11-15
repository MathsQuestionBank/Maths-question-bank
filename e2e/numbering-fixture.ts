/** Exact source-image positions for synthetic SVG fixtures. Production OCR and
 * PDF text extraction are exercised separately against examination resources. */
export function numberingFixture(imageWidth:number,imageHeight:number,originalNumber:number,numberRect:{left:number;top:number;width:number;height:number}|null,totalRect:{left:number;top:number;width:number;height:number}|null=null,marks=2){
 const fractions=(rect:{left:number;top:number;width:number;height:number})=>({left:rect.left/imageWidth,top:rect.top/imageHeight,width:rect.width/imageWidth,height:rect.height/imageHeight});
 return {
  version:1,originalNumber,imageWidth,imageHeight,method:"pdf-text",
  numberRects:numberRect?[fractions(numberRect)]:[],
  totalRects:totalRect?[{rect:fractions(totalRect),marks}]:[],
  ...(!numberRect?{numberAbsent:true}:{})
 };
}
