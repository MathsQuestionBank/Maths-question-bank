import {describe,it,expect} from 'vitest';
import {detectPaperFrame} from './paperFrame';
const blank=()=>{const data=new Uint8ClampedArray(100*100*4);data.fill(255);return data};
const pixel=(data:Uint8ClampedArray,x:number,y:number)=>{const i=(y*100+x)*4;data[i]=data[i+1]=data[i+2]=170};
describe('outer exam-paper border detection',()=>{
 it('trims inside all four long edges while retaining content inside the frame',()=>{
  const data=blank();for(let n=4;n<=95;n++){pixel(data,5,n);pixel(data,95,n)}for(let x=5;x<=95;x++){pixel(data,x,4);pixel(data,x,95)}
  expect(detectPaperFrame(data,100,100)).toEqual({left:.07,right:.93,top:.06,bottom:.93});
 });
 it('leaves borderless pages unchanged',()=>expect(detectPaperFrame(blank(),100,100)).toBeNull());
 it('does not mistake a short diagram or answer rule for a complete page frame',()=>{
  const data=blank();for(let n=30;n<70;n++){pixel(data,5,n);pixel(data,95,n)}
  expect(detectPaperFrame(data,100,100)).toBeNull();
 });
});
