import { useMemo, useState } from "react";
import KS3ResourceImporter from "./KS3ResourceImporter";

type Year = 7 | 8 | 9;
type Term = "Autumn" | "Spring" | "Summer";
type Difficulty = "Accessible" | "Developing" | "Challenge";
type KS3Problem = {
  id: string; year: Year; term: Term; block: string; step: string;
  difficulty: Difficulty; marks: number; prompt: string; solution: string;
  rights: "original"; status: "pilot";
};

// Independently written pilot material. Do not paste third-party resource text here.
const pilot: KS3Problem[] = [
  { id: "ks3-v2-y7-sequences-001", year: 7, term: "Autumn", block: "Sequences",
    step: "Predict and check terms", difficulty: "Accessible", marks: 3,
    prompt: "A pattern starts 4, 9, 14, 19, ... . Sam says 101 is in the pattern. Is Sam correct? Explain how you know.",
    solution: "The terms are 4 + 5n for n = 0, 1, 2, ... . 101 - 4 = 97, which is not a multiple of 5. Sam is incorrect.",
    rights: "original", status: "pilot" },
  { id: "ks3-v2-y7-algebra-001", year: 7, term: "Autumn", block: "Understand and use algebraic notation",
    step: "Write expressions", difficulty: "Developing", marks: 4,
    prompt: "A cinema ticket costs £x and a drink costs £3. A family buys four tickets and three drinks. Write an expression for the total cost. The family spends £45. Find x.",
    solution: "Total = 4x + 9. So 4x + 9 = 45, 4x = 36, x = 9. Each ticket costs £9.",
    rights: "original", status: "pilot" },
  { id: "ks3-v2-y7-equality-001", year: 7, term: "Autumn", block: "Equality and equivalence",
    step: "Explore equivalence", difficulty: "Challenge", marks: 4,
    prompt: "Two pupils simplify 3(2n + 4) - 2n. Ali gets 4n + 12. Bea gets 6n + 10. Decide who is correct, and explain the error in the other answer.",
    solution: "Expand: 6n + 12 - 2n = 4n + 12. Ali is correct. Bea has combined the constant 12 and the variable term -2n incorrectly.",
    rights: "original", status: "pilot" },
];
const years: Year[] = [7, 8, 9];
const terms: Term[] = ["Autumn", "Spring", "Summer"];
const difficulties: Difficulty[] = ["Accessible", "Developing", "Challenge"];

export default function KS3ProblemSolving() {
  const [year, setYear] = useState<Year>(7);
  const [term, setTerm] = useState<Term>("Autumn");
  const [block, setBlock] = useState("All blocks");
  const [difficulty, setDifficulty] = useState("All difficulties");
  const [selected, setSelected] = useState<string[]>([]);
  const [showSolutions, setShowSolutions] = useState<Record<string, boolean>>({});
  const [onlySelected, setOnlySelected] = useState(false);
  const blocks = useMemo(() => [...new Set(pilot.filter(q => q.year === year && q.term === term).map(q => q.block))], [year, term]);
  const filtered = pilot.filter(q => q.year === year && q.term === term &&
    (block === "All blocks" || q.block === block) &&
    (difficulty === "All difficulties" || q.difficulty === difficulty));
  const worksheet = pilot.filter(q => selected.includes(q.id));
  const visible = onlySelected ? worksheet : filtered;
  const toggle = (id: string) => setSelected(current => current.includes(id) ? current.filter(x => x !== id) : [...current, id]);
  return <><section className="panel ks3-area">
    <p className="print-hide">White Rose Maths V2 curriculum alignment · KS3 departmental pilot</p>
    <p className="print-hide">Browse independently written problem-solving questions. Only the first three Year 7 autumn pilot examples are available so far; full V2 small-step mapping and database-backed content are still to be added.</p>
    <div className="filter-grid print-hide">
      <label>Year group<select value={year} onChange={e => { setYear(Number(e.target.value) as Year); setBlock("All blocks"); setOnlySelected(false); }}>{years.map(y => <option key={y} value={y}>Year {y}</option>)}</select></label>
      <label>Term<select value={term} onChange={e => { setTerm(e.target.value as Term); setBlock("All blocks"); setOnlySelected(false); }}>{terms.map(t => <option key={t}>{t}</option>)}</select></label>
      <label>V2 block<select value={block} onChange={e => setBlock(e.target.value)}><option>All blocks</option>{blocks.map(b => <option key={b}>{b}</option>)}</select></label>
      <label>Difficulty<select value={difficulty} onChange={e => setDifficulty(e.target.value)}><option>All difficulties</option>{difficulties.map(d => <option key={d}>{d}</option>)}</select></label>
    </div>
    <div className="print-hide" style={{display:"flex", flexWrap:"wrap", alignItems:"center", gap:12, margin:"16px 0"}}>
      <strong>{selected.length} selected</strong>
      <button type="button" className="secondary small" onClick={() => setOnlySelected(x => !x)}>{onlySelected ? "Back to filtered questions" : "View selected worksheet"}</button>
      <button type="button" className="secondary small" disabled={!selected.length} onClick={() => { setOnlySelected(true); window.setTimeout(() => window.print(), 50); }}>Print selected questions</button>
      <button type="button" className="secondary small" disabled={!selected.length} onClick={() => setSelected([])}>Clear selection</button>
    </div>
    {!visible.length && <p>No pilot questions match this view yet. Try Year 7 · Autumn, or select questions first.</p>}
    {visible.map((q, index) => <article key={q.id} style={{padding:"16px 0", borderTop:"1px solid var(--border, #ddd)"}}>
      <div style={{display:"flex", justifyContent:"space-between", gap:12, alignItems:"center"}}>
        <strong>Question {index + 1} · {q.marks} marks</strong>
        <label className="print-hide"><input type="checkbox" checked={selected.includes(q.id)} onChange={() => toggle(q.id)} /> Include in worksheet</label>
      </div>
      <p className="print-hide">{q.block} · {q.step} · {q.difficulty}</p>
      <p style={{whiteSpace:"pre-wrap"}}>{q.prompt}</p>
      <button type="button" className="secondary small print-hide" onClick={() => setShowSolutions(current => ({...current, [q.id]: !current[q.id]}))}>{showSolutions[q.id] ? "Hide" : "Show"} solution</button>
      {showSolutions[q.id] && <p className="print-hide"><strong>Worked solution: </strong>{q.solution}</p>}
    </article>)}
    <p className="print-hide" style={{fontSize:12}}>Pilot content is original to MathsQuestionBank. White Rose alignment is a curriculum reference, not an endorsement or licence to reproduce its teaching materials.</p>
  </section><KS3ResourceImporter/></>;
}
