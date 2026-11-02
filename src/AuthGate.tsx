import { createContext, useContext, useEffect, useState, type ReactNode, type FormEvent } from "react";
import { supabase } from "./supabase";

export type AccountRole = "owner" | "teacher";
const AccountContext = createContext<AccountRole>("teacher");
export function useAccountRole(): AccountRole { return useContext(AccountContext); }

type Status = "loading" | "signed-out" | "pending" | "owner" | "teacher" | "setup";

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
  const {data:{subscription}}=supabase.auth.onAuthStateChange((event)=>{
   if(event==="PASSWORD_RECOVERY"){setStatus("setup");return;}
   if(!setup)void check();
  });
  return()=>{active=false;subscription.unsubscribe()};
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

 if(status==="loading")return <main className="auth-page"><div className="auth-card"><h1>Maths Question Bank</h1><p>Checking secure access…</p></div></main>;
 if(status==="setup")return <main className="auth-page"><div className="auth-card"><h1>Set your password</h1><form onSubmit={async e=>{e.preventDefault();setBusy(true);const {error}=await supabase.auth.updateUser({password:newPassword});setBusy(false);if(error)setMessage(error.message);else window.location.replace(window.location.origin)}}><label>New password<input required type="password" minLength={12} value={newPassword} onChange={e=>setNewPassword(e.target.value)}/></label><button disabled={busy}>Save password</button></form>{message&&<p role="alert">{message}</p>}</div></main>;
 if(status==="signed-out")return <main className="auth-page"><div className="auth-card">
  <div className="auth-logo">∑</div><h1>Maths Question Bank</h1>
  <p>{register?"Create an account for the departmental teacher pilot. Accounts require email verification and owner approval.":"Sign in to view your available question bank and saved assessments."}</p>
  <form onSubmit={submit}>
   <label>Email address<input required type="email" autoComplete="username" value={email} onChange={e=>setEmail(e.target.value)}/></label>
   <label>Password<input required type="password" minLength={register?12:undefined} autoComplete={register?"new-password":"current-password"} value={password} onChange={e=>setPassword(e.target.value)}/></label>
   {register&&<label>Confirm password<input required type="password" minLength={12} autoComplete="new-password" value={confirmPassword} onChange={e=>setConfirmPassword(e.target.value)}/></label>}
   <button className="primary full" disabled={busy}>{busy?"Working…":register?"Create teacher account":"Sign in"}</button>
  </form>
  {message&&<p role="status" className={message.startsWith("Unable")?"auth-error":""}>{message}</p>}
  <button className="auth-switch" type="button" onClick={()=>{setRegister(!register);setMessage("");setPassword("");setConfirmPassword("");}}>{register?"Already have an account? Sign in":"New teacher? Create an account"}</button>
  <p className="hint">Pilot accounts only. We use your email address for authentication and access approval; do not upload pupil personal data. Original practice questions only are available to teachers until appropriate exam-board rights are confirmed.</p>
 </div></main>;
 if(status==="pending")return <main className="auth-page"><div className="auth-card">
  <h1>Account awaiting approval</h1><p>Your email is signed in, but teacher access has not yet been approved. Please ask the Maths Question Bank owner to approve your account for the departmental pilot.</p>
  <button className="secondary" onClick={()=>void supabase.auth.signOut()}>Sign out</button>
 </div></main>;
 return <AccountContext.Provider value={status==="owner"?"owner":"teacher"}>{children}</AccountContext.Provider>;
}
