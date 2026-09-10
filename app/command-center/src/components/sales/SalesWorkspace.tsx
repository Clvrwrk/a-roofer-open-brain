/// <reference types="vite/client" />
import {useMemo} from 'react';
import {createSalesClient,type SalesRoute} from '@proexteriors/sales-workspace';
import '@proexteriors/sales-workspace/styles.css';
import CrmSalesMirror from './CrmSalesMirror';
/** Optional CRM mirror confined to /sales. The existing staff BFF owns authorization. */
export default function DesktopSales({initialRoute}:{initialRoute:SalesRoute}){
 const logoSrc=(import.meta.env.CRM_SALES_MIRROR_ASSETS_PREFIX||'')+'/pro-exteriors-logo.svg';
 const client=useMemo(()=>createSalesClient({apiBase:'/api/sales'}),[]);
 return <>{initialRoute.effortId&&<p className="cc-sales-mirror-notice">Open Lead Management or Canonical job efforts to find this customer; saved legacy effort links do not select a record here.</p>}<CrmSalesMirror logoSrc={logoSrc} client={client} practice={false} homeHref="/" loginHref="/auth/login?returnTo=%2Fsales" logoutAction="/auth/logout"/></>;
}
