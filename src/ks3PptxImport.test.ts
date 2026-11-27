import { describe, expect, it } from "vitest";
import { makeDrafts, suggestedStepId } from "./ks3PptxImport";

describe("KS3 Year 7 Sequences importer mapping", () => {
  it("maps pair numbers to the correct curriculum areas", () => {
    expect(suggestedStepId(2)).toBe("y7-7.1-01");
    expect(suggestedStepId(14)).toBe("y7-7.1-03");
    expect(suggestedStepId(16)).toBe("y7-7.1-04");
    expect(suggestedStepId(26)).toBe("y7-7.1-05");
    expect(suggestedStepId(34)).toBe("y7-7.1-06");
    expect(suggestedStepId(40)).toBe("y7-7.1-07");
    expect(suggestedStepId(50)).toBe("y7-7.1-08");
  });
  it("creates unpublished drafts and requires explicit visual review", () => {
    const rows = makeDrafts([{questionSlide:2,answerSlide:3,questionText:"Question",answerText:"Answer"}]);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      review:"needs-review", marks:null, visualReviewRequired:true,
      questionSlide:2, answerSlide:3, stepId:"y7-7.1-01"
    });
  });
});
