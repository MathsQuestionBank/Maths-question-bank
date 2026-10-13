import { useMemo, useState } from "react";

type Qualification = "GCSE Mathematics" | "GCSE Statistics" | "Further Mathematics";
type Tier = "Foundation" | "Higher";
type Question = { id: string; topic: string; tier: Tier; grade: number; marks: number; calculator: boolean; qualification: Qualification; prompt: string; answer: string };

const demoQuestions: Question[] = [
  { id: "demo-1", topic: "Ratio", tier: "Foundation", grade: 4, marks: 3, calculator: false, qualification: "GCSE Mathematics", prompt: "Share £84 in the ratio 2 : 5.", answer: "£24 and £60" },
  { id: "demo-2", topic: "Algebra", tier: "Higher", grade: 6, marks: 3, calculator: false, qualification: "GCSE Mathematics", prompt: "Solve 3(2x − 1) = 4x + 9.", answer: "x = 6" },
  { id: "demo-3", topic: "Probability", tier: "Higher", grade: 7, marks: 4, calculator: true, qualification: "GCSE Mathematics", prompt: "A bag contains 5 red and 3 blue counters. Two counters are drawn without replacement. Find the probability both are red.", answer: "5/14" },
  { id: "demo-4", topic: "Percentages", tier: "Foundation", grade: 5, marks: 3, calculator: true, qualification: "GCSE Mathematics", prompt: "A jacket is reduced by 20% to £56. Find its original price.", answer: "£70" },
];

export default function App() {
  const [qualification, setQualification] = useState<Qualification>("GCSE Mathematics");
  const [tier, setTier] = useState("All tiers");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [title, setTitle] = useState("Mathematics Assessment");
  const [minutes, setMinutes] = useState(45);
  const [cover, setCover] = useState(true);
  const [showAnswers, setShowAnswers] = useState(false);
  const [tab, setTab] = useState<"browse" | "create">("browse");

  const filtered = useMemo(() => demoQuestions.filter(q => q.qualification === qualification && (tier === "All tiers" || q.tier === tier) && (q.topic + " " + q.prompt).toLowerCase().includes(search.toLowerCase())), [qualification, tier, search]);
  const chosen = demoQuestions.filter(q => selected.includes(q.id));
  const total = chosen.reduce((sum, q) => sum + q.marks, 0);
  const toggle = (id: string) => setSelected(current => current.includes(id) ? current.filter(item => item !== id) : [...current, id]);

  return <div className="site">
    <header className="header"><div className="header-inner"><div className="brand"><span className="logo">∑</span><span>Maths <strong>Question Bank</strong></span></div><span className="header-note">Made for UK mathematics teachers</span></div></header>
    <main className="main">
      <section className="hero"><span className="eyebrow">ASSESSMENT BUILDER</span><h1>Find questions. Build better assessments.</h1><p>Browse by qualification, topic and tier, then assemble an assessment in minutes.</p><div className="hero-actions"><button className="primary" onClick={() => setTab("browse")}>Browse questions</button><button className="secondary" onClick={() => setTab("create")}>Assessment creator <span className="count">{selected.length}</span></button></div></section>
      <div className="notice"><strong>Early preview:</strong> Questions shown are original demonstration examples, not imported exam-board questions. PDF import, accounts and cloud storage are not yet available.</div>
      <div className="tabs"><button className={tab === "browse" ? "active" : ""} onClick={() => setTab("browse")}>Question bank</button><button className={tab === "create" ? "active" : ""} onClick={() => setTab("create")}>Assessment creator ({selected.length})</button></div>
      {tab === "browse" ? <div className="layout"><aside className="panel filters"><h2>Filter questions</h2><label>Qualification<select value={qualification} onChange={e => { setQualification(e.target.value as Qualification); setTier("All tiers"); }}><option>GCSE Mathematics</option><option>GCSE Statistics</option><option>Further Mathematics</option></select></label><label>Tier<select value={tier} onChange={e => setTier(e.target.value)}><option>All tiers</option><option>Foundation</option><option>Higher</option></select></label><label>Search topics or questions<input placeholder="e.g. ratio, algebra…" value={search} onChange={e => setSearch(e.target.value)} /></label><button className="text-button" onClick={() => {setTier("All tiers"); setSearch("");}}>Clear filters</button></aside><section className="results"><div className="section-heading"><div><h2>Question bank</h2><p>{filtered.length} example questions available</p></div><button className="secondary small" onClick={() => setTab("create")}>View selection ({selected.length})</button></div>{filtered.length === 0 ? <div className="panel empty"><h3>No questions yet</h3><p>This qualification or filter has no demonstration questions. Import functionality is planned for a future release.</p></div> : filtered.map(q => <article className="question-card" key={q.id}><div className="question-top"><div><span className="tag">{q.topic}</span><span className="tag muted">{q.tier}</span><span className="tag muted">Grade {q.grade}</span></div><span className="marks">{q.marks} marks</span></div><p className="prompt">{q.prompt}</p><div className="question-bottom"><span>{q.calculator ? "Calculator" : "Non-calculator"}</span><button className={selected.includes(q.id) ? "added" : "primary small"} onClick={() => toggle(q.id)}>{selected.includes(q.id) ? "✓ Added — remove" : "+ Add to assessment"}</button></div></article>)}</section></div> :
      <div className="layout"><aside className="panel filters"><h2>Assessment settings</h2><label>Assessment title<input value={title} onChange={e => setTitle(e.target.value)} /></label><label>Time allowance (minutes)<input type="number" min="1" value={minutes} onChange={e => setMinutes(Math.max(1, Number(e.target.value) || 1))} /></label><label className="check"><input type="checkbox" checked={cover} onChange={e => setCover(e.target.checked)}/> Include cover page</label><label className="check"><input type="checkbox" checked={showAnswers} onChange={e => setShowAnswers(e.target.checked)}/> Show mark scheme</label><button className="primary full" disabled={!chosen.length} onClick={() => window.print()}>Print / save as PDF</button><p className="hint">Use your browser’s print dialog to save as PDF. Assessment saving and advanced layout controls are coming later.</p></aside><section className="results"><div className="section-heading"><div><h2>Assessment preview</h2><p>{chosen.length} questions · {total} marks</p></div><button className="secondary small" onClick={() => setTab("browse")}>+ Add questions</button></div><div className="paper">{cover && <div className="cover"><div className="paper-brand">MATHS QUESTION BANK</div><h2>{title || "Untitled assessment"}</h2><p>Time allowed: {minutes} minutes</p><p>Total marks: {total}</p><div className="name-line">Name: __________________________________</div><p className="paper-instructions">Answer all questions. Show your working clearly.</p></div>}{chosen.length === 0 ? <div className="empty"><h3>Your assessment is empty</h3><p>Add questions from the question bank to build your paper.</p></div> : chosen.map((q, index) => <div className="paper-question" key={q.id}><div className="paper-row"><strong>{index + 1}.</strong><span>{q.prompt}</span><span className="marks">({q.marks} marks)</span></div><div className="working-space" /><button className="remove print-hide" onClick={() => toggle(q.id)}>Remove</button></div>)}{showAnswers && chosen.length > 0 && <div className="mark-scheme"><h2>Mark scheme</h2>{chosen.map((q, index) => <p key={q.id}><strong>{index + 1}.</strong> {q.answer} <span>({q.marks} marks)</span></p>)}</div>}</div></section></div>}
      <footer>Maths Question Bank · Initial preview · Original demonstration content only</footer>
    </main>
  </div>;
}
