import {useEffect,useState,useRef} from 'react';
import {WeeklyWorkspace,type SalesClient} from '@proexteriors/sales-workspace';
import './crm-mirror.css';

/** Live release shell. Records and permissions come only from the canonical client. */
export default function CrmSalesMirror({client,practice,homeHref='/',loginHref='/auth/login?returnTo=%2Fsales',logoutAction='/auth/logout',logoSrc='/pro-exteriors-logo.svg'}:{client:SalesClient;practice:boolean;homeHref?:string;loginHref?:string;logoutAction?:string;logoSrc?:string}){
 const [ready,setReady]=useState(false),[error,setError]=useState(''),[attempt,setAttempt]=useState(0),[online,setOnline]=useState(true),[collapsed,setCollapsed]=useState(false),[role,setRole]=useState('');
 useEffect(()=>{if(window.matchMedia('(max-width:1000px)').matches)setCollapsed(true);},[]);
 const dirty=useRef(false),pending=useRef(false);
 useEffect(()=>{let active=true;setReady(false);setError('');client.session().then(session=>{
  if(!active)return;if(!practice&&!session.capabilities.includes('wip_read')){setError('Your account does not have WIP/AR access. Your administrator needs to assign your review permissions.');return;}setRole(session.role);setReady(true);
 }).catch(()=>{if(active)setError('Your staff access could not be verified. Reconnect, then try again or sign in.');});return()=>{active=false;};},[client,attempt,practice]);
 useEffect(()=>{
  const network=()=>setOnline(navigator.onLine);network();window.addEventListener('online',network);window.addEventListener('offline',network);
  const leave=(e:BeforeUnloadEvent)=>{if(dirty.current||pending.current){e.preventDefault();}};window.addEventListener('beforeunload',leave);
  return()=>{window.removeEventListener('online',network);window.removeEventListener('offline',network);window.removeEventListener('beforeunload',leave);};
 },[]);
 return <div className={`wip-release${collapsed?' wip-rail-collapsed':''}`}>
  <a className="wip-skip" href="#wip-main">Skip to weekly review</a>
  <aside className="wip-release-nav" aria-label="Customer journey">
   <a className="wip-release-brand" href={homeHref} aria-label="Pro Exteriors home"><img src={logoSrc} alt="Pro Exteriors" width="220" height="90"/></a>
   <p className="wip-nav-label">Customer journey</p>
   {[
    {title:'Prospecting',hint:'Before appointment or engagement',items:['Activity & outreach']},
    {title:'Lead Management',hint:'Engaged · before contingency signing',items:['Appointments & engagement','Contingency agreements']},
    {title:'Job Operations Management',hint:'JobTread / AccuLynx mirrors',items:['Job progress & operations']},
    {title:'Job Finance Management',hint:'Balances, collections & weekly review',items:['WIP/AR']},
    {title:'Sales Team (Rep) Management/Training',hint:'People, performance & development',items:['Rep management','Training']},
   ].map((section,index)=><details key={section.title} open={index===3}><summary><span className="wip-nav-icon" aria-hidden="true">{['◎','◇','⚙','$','↗'][index]}</span><span>{section.title}</span></summary><p>{section.hint}</p><ul>{section.items.map(label=><li key={label}>{label==='WIP/AR'?<a href="#wip-main" aria-current="page">WIP/AR</a>:<span aria-disabled="true">{label}<small>Coming later</small></span>}</li>)}</ul></details>)}
  </aside>
  <div className="wip-release-layout">
   <header className="wip-release-header"><button type="button" className="wip-rail-toggle" aria-label="Toggle sidebar" aria-expanded={!collapsed} onClick={()=>setCollapsed(value=>!value)}>☰</button><div className="wip-release-title"><p>Job Finance Management</p><h1>WIP/AR</h1></div><div className="wip-session"><span>{practice?'Practice workspace':ready?'Staff session':'Verifying access'}</span>{role&&<small>{role==='admin'?'Administrator':role==='project_manager'?'Project manager':role==='manager'?'Sales manager':role==='sales_rep'?'Sales representative':'Staff workspace'}</small>}</div>
   {!practice&&<form method="post" action={logoutAction} onSubmit={e=>{if(pending.current||dirty.current&&!window.confirm('Leave this review and sign out? Unsaved answers will be lost.'))e.preventDefault();}}><button type="submit">Sign out</button></form>}
   </header>
   <main id="wip-main" tabIndex={-1} className="wip-release-main">
    {!online&&<p className="wip-connectivity" role="status">You’re offline. Keep your review open. Saving and Wednesday submission need a confirmed connection.</p>}
    {error?<section className="wip-access-state" role="alert"><h1>Let’s reconnect your workspace</h1><p>{error}</p><button onClick={()=>setAttempt(n=>n+1)}>Check access again</button>{!practice&&<a href={loginHref}>Sign in</a>}</section>:!ready?<section className="wip-access-state" role="status"><h1>Opening your weekly review</h1><p>Checking your staff access and assigned contracts.</p></section>:<div className="sales-workspace"><WeeklyWorkspace client={client} practice={practice} embedded desktopBoard canManageRepAccess={role==='admin'} onDirty={value=>{dirty.current=value;}} onPending={value=>{pending.current=value;}}/></div>}
   </main>
  </div>
 </div>;
}
