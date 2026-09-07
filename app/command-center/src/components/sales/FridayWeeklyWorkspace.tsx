import {useEffect,useMemo,useState} from 'react';
import {WeeklyWorkspace,createSalesClient} from '@proexteriors/sales-workspace';
import '@proexteriors/sales-workspace/styles.css';
/** Same canonical records and controls as the PWA. No legacy loader, pack, or Send calls. */
export default function FridayWeeklyWorkspace(){
 const client=useMemo(()=>createSalesClient({apiBase:'/api/sales'}),[]);
 const [ready,setReady]=useState(false),[error,setError]=useState(''),[dirty,setDirty]=useState(false),[pending,setPending]=useState(false);
 useEffect(()=>{let live=true;client.session().then(()=>{if(live)setReady(true);}).catch(e=>{if(live)setError(e.message);});return()=>{live=false;};},[client]);
 useEffect(()=>{if(!dirty&&!pending)return;const leave=(e:BeforeUnloadEvent)=>{e.preventDefault();e.returnValue='';};window.addEventListener('beforeunload',leave);return()=>window.removeEventListener('beforeunload',leave);},[dirty,pending]);
 return <div className="sales-workspace">{error?<section role="alert"><h2>Friday review connection unavailable</h2><p>{error}</p><button onClick={()=>window.location.reload()}>Reconnect</button></section>:<WeeklyWorkspace client={client} ready={ready} embedded onDirty={setDirty} onPending={setPending}/>}</div>;
}
