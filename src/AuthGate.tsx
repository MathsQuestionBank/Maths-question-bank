import { createContext, useContext, useEffect, useState, type ReactNode, type FormEvent } from "react";
import { supabase } from "./supabase";

export type AccountRole = "owner" | "teacher";
const AccountContext = createContext<AccountRole>("teacher");
export function useAccountRole(): AccountRole { return useContext(AccountContext); }

type Status = "loading" | "signed-out" | "pending" | "owner" | "teacher" | "setup";

/** Keep the logged-out experience visually aligned with the signed-in site, without exposing navigation. */
function AuthShell({children,wide=false}:{children:ReactNode;wide?:boolean}){
 return <div className="auth-site">
  <header className="auth-masthead">
   <svg className="auth-masthead-lines" viewBox="0 0 1200 160" preserveAspectRatio="none" aria-hidden="true" focusable="false">
    <g stroke="#ae7795" strokeWidth="1.3" fill="none">
     <path d="M0 129 L120 0 L295 160 L430 0 L565 160 L742 0 L908 160 L1070 0 L1200 120"/>
     <path d="M0 15 L182 160 L312 0 L520 160 L775 0 L1015 160 L1170 0"/>
     <path d="M90 0 L210 160 L410 0 L630 160 L825 0 L1020 160"/>
     <path d="M0 76 L1200 45 M0 146 L1200 109"/>
    </g>
   </svg>
   <div className="auth-masthead-inner">
    <div className="auth-brand-wrap">
     <h1 className="auth-wordmark">Maths <em>Question Bank</em></h1>
     <span className="auth-brand-tagline">MADE FOR MATHEMATICS TEACHERS</span>
    </div>
    <span className="auth-masthead-note">Find questions. Build better assessments.</span>
   </div>
  </header>
  <div className="auth-nav-edge" aria-hidden="true"/>
  <main className={wide?"auth-page auth-page-wide":"auth-page auth-page-compact"}>{children}</main>
  <footer className="auth-footer">Maths Question Bank · Restricted staff access</footer>
 </div>;
}

export default function AuthGate({children}:{children:ReactNode}){
 const [status,setStatus]=useState<Status>("loading");
 const [email,setEmail]=useState("");
 const [password,setPassword]=useState("");
 const [confirmPassword,setConfirmPassword]=useState("");
 const [register,setRegister]=useState(false);
 const [message,setMessage]=useState("");
 const [busy,setBusy]=useState(false);
 const [newPassword,setNewPassword]=useState("");

 useEffect(()=>{
  let active=true;
  const linkType=new URLSearchParams(window.location.hash.slice(1)).get("type");
  const setup=linkType==="invite"||linkType==="recovery";
  if(setup)setStatus("setup");
  const check=async()=>{
   const {data:{user}}=await supabase.auth.getUser();
   if(!active||setup)return;
   if(!user){setStatus("signed-out");return;}
   const {data,error}=await supabase.from("profiles").select("role,approved").eq("user_id",user.id).maybeSingle();
   if(!active)return;
   setStatus(!error&&data?.approved===true?(data.role==="owner"?"owner":data.role==="member"?"teacher":"pending"):"pending");
  };
  void check();
  // Approval and revocation are enforced by RLS immediately. Check active sessions
  // periodically as well so a disabled teacher loses the UI without a reload.
  const timer=window.setInterval(()=>{void check();},60000);
  const onVisible=()=>{if(document.visibilityState==="visible")void check();};
  document.addEventListener("visibilitychange",onVisible);
  const {data:{subscription}}=supabase.auth.onAuthStateChange((event)=>{
   if(event==="PASSWORD_RECOVERY"){setStatus("setup");return;}
   if(!setup)void check();
  });
  return()=>{active=false;window.clearInterval(timer);document.removeEventListener("visibilitychange",onVisible);subscription.unsubscribe()};
 },[]);

 const submit=async(e:FormEvent)=>{
  e.preventDefault();setMessage("");
  if(register&&(password.length<12||password!==confirmPassword)){setMessage("Use at least 12 characters and confirm the matching password.");return;}
  setBusy(true);
  try {
   if(register){
    const {error}=await supabase.auth.signUp({email:email.trim(),password,options:{emailRedirectTo:window.location.origin}});
    if(error)throw error;
    setMessage("Please check your email for a verification link. After confirming, your teacher account will await approval for the departmental pilot.");
    setRegister(false);setPassword("");setConfirmPassword("");
   } else {
    const {error}=await supabase.auth.signInWithPassword({email:email.trim(),password});
    if(error)throw error;
   }
  } catch(e){setMessage(e instanceof Error?e.message:"Unable to complete the request.");}
  finally{setBusy(false);}
 };

 if(status==="loading")return <AuthShell><section className="auth-card auth-status-card" aria-live="polite"><h2>Checking access</h2><p>Verifying your account and permissions…</p></section></AuthShell>;
 if(status==="setup")return <AuthShell><section className="auth-card auth-status-card">
  <span className="auth-kicker">ACCOUNT SECURITY</span><h2>Set your password</h2>
  <p>Choose a password to finish setting up your account.</p>
  <form onSubmit={async e=>{e.preventDefault();setBusy(true);const {error}=await supabase.auth.updateUser({password:newPassword});setBusy(false);if(error)setMessage(error.message);else window.location.replace(window.location.origin)}}>
   <label>New password<input required type="password" minLength={12} autoComplete="new-password" value={newPassword} onChange={e=>setNewPassword(e.target.value)}/></label>
   <button className="auth-submit" disabled={busy}>{busy?"Saving…":"Save password"}</button>
  </form>
  {message&&<p role="alert" className="auth-error">{message}</p>}
 </section></AuthShell>;
 if(status==="signed-out")return <AuthShell wide>
  <div className="auth-introduction">
   <span className="auth-kicker auth-kicker-intro">YOUR DEPARTMENT'S QUESTION BANK</span>
   <h2>Find the right questions.<br/>Build better assessments.</h2>
   <p className="auth-intro-copy">Search GCSE maths questions by topic, skill and grade, then turn them into ready-to-use worksheets and assessments.</p>
   <div className="auth-capabilities">
    <div><span className="auth-capability-line"/><p><strong>Find</strong> questions using enhanced skills mapping.</p></div>
    <div><span className="auth-capability-line"/><p><strong>Build</strong> assessments with questions and mark schemes.</p></div>
    <div><span className="auth-capability-line"/><p><strong>Save</strong> worksheets to your own private account.</p></div>
   </div>
   <p className="auth-intro-footnote">A resource for approved school staff — not a public question bank.</p>
  </div>
  <section className="auth-card auth-signin-card" aria-label={register?"Teacher registration":"Staff sign in"}>
   <span className="auth-kicker">{register?"REQUEST ACCESS":"STAFF ACCESS"}</span>
   <h2>{register?"Create your account":"Welcome back"}</h2>
   <p className="auth-card-description">{register?"Register using your school email. Your account will need email verification and manual approval before you can access the bank.":"Sign in to access your question bank and saved assessments."}</p>
   <form onSubmit={submit}>
    <label>Email address<input required type="email" autoComplete="username" placeholder="you@school.org.uk" value={email} onChange={e=>setEmail(e.target.value)}/></label>
    <label>Password<input required type="password" minLength={register?12:undefined} autoComplete={register?"new-password":"current-password"} value={password} onChange={e=>setPassword(e.target.value)}/></label>
    {register&&<label>Confirm password<input required type="password" minLength={12} autoComplete="new-password" value={confirmPassword} onChange={e=>setConfirmPassword(e.target.value)}/></label>}
    <button className="auth-submit" disabled={busy}>{busy?"Working…":register?"Create teacher account":"Sign in"}</button>
   </form>
   {message&&<p role="status" className="auth-feedback">{message}</p>}
   <div className="auth-switch-section">
    <p>{register?"Already have an account?":"New to Maths Question Bank?"}</p>
    <button className="auth-switch" type="button" onClick={()=>{setRegister(!register);setMessage("");setPassword("");setConfirmPassword("");}}>{register?"Already have an account? Sign in":"New teacher? Create an account"}</button>
   </div>
   <p className="auth-privacy-note">Restricted to approved school staff. Do not upload pupil personal data. Eligible Edexcel papers are available to approved accounts; older material remains restricted.</p>
  </section>
 </AuthShell>;
 if(status==="pending")return <AuthShell><section className="auth-card auth-status-card">
  <span className="auth-kicker">ACCESS REQUEST</span>
  <h2>Account awaiting approval</h2>
  <p>Your email is signed in, but teacher access has not yet been approved. Please ask the Maths Question Bank owner to approve your account for the departmental pilot.</p>
  <div className="auth-status-detail">Your account is secure. The question bank will be available once access has been approved.</div>
  <button className="auth-secondary" onClick={()=>void supabase.auth.signOut()}>Sign out</button>
 </section></AuthShell>;
 return <AccountContext.Provider value={status==="owner"?"owner":"teacher"}>{children}</AccountContext.Provider>;
}
