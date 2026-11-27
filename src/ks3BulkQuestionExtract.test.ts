import {describe,expect,it} from "vitest";
import {proposePairs} from "./ks3BulkQuestionExtract";

describe("Year 7 source extraction review safety",()=>{
  it("starts after the cover and proposes unverified pairs for odd-length decks",()=>{
    const result=proposePairs(["Cover","Q1","A1","Q2","A2"]);
    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({sourceQuestionSlide:2,suggestedAnswerSlide:3,
      questionText:"Q1",suggestedAnswerText:"A1",pairingConfidence:"candidate",visualCheckRequired:true});
  });
  it("does not fabricate an answer for a trailing unmatched slide",()=>{
    const result=proposePairs(["Cover","Q1","A1","Q2"]);
    expect(result[1]).toMatchObject({sourceQuestionSlide:4,suggestedAnswerSlide:null,
      suggestedAnswerText:"",visualCheckRequired:true});
  });
  it("leaves empty extracted content empty instead of inventing mathematical text",()=>{
    const result=proposePairs(["Cover","",""]);
    expect(result[0].questionText).toBe("");
    expect(result[0].suggestedAnswerText).toBe("");
  });
});
