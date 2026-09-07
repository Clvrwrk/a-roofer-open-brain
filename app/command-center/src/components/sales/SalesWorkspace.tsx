import {useMemo} from 'react';
import {SalesWorkspace,createSalesClient,salesPath,type SalesRoute} from '@proexteriors/sales-workspace';
import '@proexteriors/sales-workspace/styles.css';
/** WorkOS and CRM authorization stay in same-origin server middleware/BFF. */
export default function DesktopSales({initialRoute}:{initialRoute:SalesRoute}) {
 const client=useMemo(()=>createSalesClient({apiBase:'/api/sales'}),[]);
 return <SalesWorkspace client={client} initialRoute={initialRoute} embedded
   onNavigate={route=>window.location.assign(salesPath(route))}
   onTabChange={tab=>{if(initialRoute.effortId)window.history.replaceState(window.history.state,'',salesPath({...initialRoute,tab}));}}/>;
}
