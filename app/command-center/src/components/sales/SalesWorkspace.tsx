import {useEffect,useId,useMemo,useRef,useState} from 'react';
import {WeeklyWorkspace,createSalesClient,type SalesRoute} from '@proexteriors/sales-workspace';
import '@proexteriors/sales-workspace/styles.css';
import './sales-wip-shell.css';

/** Every Sales URL opens the same WIP-only release. Authorization stays in the staff BFF. */
export default function DesktopSales({initialRoute}:{initialRoute:SalesRoute}) {
 const client=useMemo(()=>createSalesClient({apiBase:'/api/sales'}),[]);
 const [ready,setReady]=useState(false),[error,setError]=useState(''),[attempt,setAttempt]=useState(0);
 const [online,setOnline]=useState(true),[notice,setNotice]=useState('');
 const dirty=useRef(false),pending=useRef(false),region=useId();
 useEffect(()=>{
  let live=true;setReady(false);setError('');
  client.session().then(session=>{
   if(!live)return;
   if(!Array.isArray(session.capabilities)||!session.capabilities.includes('wip_read')){
    setError('Your account does not have WIP/AR access. Your administrator needs to assign your review permissions.');return;
   }
   setReady(true);
  }).catch(()=>{if(live)setError('Your staff access could not be verified. Reconnect, then try again or sign in.');});
  return()=>{live=false;};
 },[client,attempt]);
 useEffect(()=>{
  const network=()=>setOnline(navigator.onLine);network();
  const leave=(event:BeforeUnloadEvent)=>{if(dirty.current||pending.current){event.preventDefault();event.returnValue='';}};
  const blockPending=(event:Event)=>{
   if(!pending.current||event.defaultPrevented)return;
   if(event.type==='click'){
    const anchor=event.target instanceof Element?event.target.closest('a[href]'):null;
    if(!(anchor instanceof HTMLAnchorElement)||anchor.target==='_blank'||anchor.hasAttribute('download'))return;
    const destination=new URL(anchor.href,window.location.href);
    if(!['http:','https:'].includes(destination.protocol))return;
    if(destination.origin===window.location.origin&&destination.pathname===window.location.pathname&&destination.search===window.location.search&&destination.hash)return;
   }
   event.preventDefault();event.stopImmediatePropagation();
   setNotice('A save or upload is still in progress. Keep this review open until it finishes.');
  };
  window.addEventListener('online',network);window.addEventListener('offline',network);
  window.addEventListener('beforeunload',leave);
  document.addEventListener('click',blockPending,true);document.addEventListener('submit',blockPending,true);
  return()=>{
   window.removeEventListener('online',network);window.removeEventListener('offline',network);
   window.removeEventListener('beforeunload',leave);
   document.removeEventListener('click',blockPending,true);document.removeEventListener('submit',blockPending,true);
  };
 },[]);
 return <div className="cc-sales-wip-shell">
  <nav className="cc-sales-wip-nav" aria-label="Sales workspace">
   <a href={'#'+region} aria-current="page">WIP/AR review</a>
   {['Lead management','Prospecting','Inspections','Agreements','Sales performance'].map(label=><button key={label} type="button" disabled>{label}<small>Coming later</small></button>)}
  </nav>
  {initialRoute.effortId&&<p className="cc-sales-wip-message">This Sales release is focused on weekly WIP/AR. Prospect and agreement workflows are not available yet.</p>}
  <section id={region} tabIndex={-1} className="cc-sales-wip-content" aria-label="Weekly review workspace">
   {!online&&<p className="cc-sales-wip-message" role="status">You’re offline. Keep your review open. Saving and Wednesday submission need a confirmed connection.</p>}
   {notice&&<p className="cc-sales-wip-message" role="status">{notice}</p>}
   {error?<section className="cc-sales-wip-access" role="alert"><h2>Let’s reconnect your workspace</h2><p>{error}</p><div><button type="button" onClick={()=>setAttempt(value=>value+1)}>Check access again</button><a href="/auth/login?returnTo=%2Fsales">Sign in</a></div></section>
    :!ready?<section className="cc-sales-wip-access" role="status"><h2>Opening your weekly review</h2><p>Checking your staff access and assigned contracts.</p></section>
    :<div className="sales-workspace"><WeeklyWorkspace client={client} embedded onDirty={value=>{dirty.current=value;}} onPending={value=>{pending.current=value;if(!value)setNotice('');}}/></div>}
  </section>
 </div>;
}
