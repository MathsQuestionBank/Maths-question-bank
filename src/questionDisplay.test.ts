import {describe,it,expect} from "vitest";
import {formatQuestionTitle} from "./questionDisplay";

describe("question-card titles",()=>{
 it("displays historic Higher questions using their existing readable reference",()=>{
  expect(formatQuestionTitle({
   series:"November 2022",sourceId:"2022_3H_Q23a",paperCode:"3H",
   skill:"Translations and reflections of a function"
  })).toBe("November 2022 3H - Q23a - Translations And Reflections Of A Function");
 });
 it("hides the internal Foundation mapping identifier in favour of the exam reference",()=>{
  expect(formatQuestionTitle({
   series:"November 2022",sourceId:"EDX-F-NOVEMBER2022-1F-Q09B",paperCode:"1F",skill:"Angles"
  })).toBe("November 2022 1F - Q09b - Angles");
 });
 it("formats multipart references and doesn't rely on hardcoding Edexcel",()=>{
  expect(formatQuestionTitle({
   series:"June 2023",sourceId:"AQA-F-JUNE2023-2F-Q07BII",paperCode:"2F",skill:"probability"
  })).toBe("June 2023 2F - Q07bii - Probability");
 });
 it("retains a usable label for unknown existing identifiers",()=>{
  expect(formatQuestionTitle({
   series:"June 2021",sourceId:"unknown-ref",skill:"Ratio"
  })).toBe("June 2021 - unknown-ref - Ratio");
 });
});
