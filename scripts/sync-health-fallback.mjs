// Independent delivery incident, pinned repository and fixed sanitized content.
const BASE='https://api.github.com/repos/Clvrwrk/a-roofer-open-brain/issues';
const TITLE='Sync health alert delivery unavailable';
const MARKER='<!-- integration-sync-health-fallback -->';
export async function updateDeliveryFallback(healthy,token,fetcher=fetch){
 if(!token)throw new Error('fallback_credential_missing');
 const request=async(url,method='GET',data)=>{
  const r=await fetcher(url,{method,redirect:'error',headers:{Authorization:`Bearer ${token}`,Accept:'application/vnd.github+json','Content-Type':'application/json'},body:data?JSON.stringify(data):undefined,signal:AbortSignal.timeout(10000)});
  if(!r.ok)throw new Error('fallback_request_failed');return r.status===204?null:r.json();
 };
 const issues=await request(BASE+'?state=open&per_page=100');
 if(!Array.isArray(issues))throw new Error('fallback_response_invalid');
 const existing=issues.find(i=>i.title===TITLE&&i.body?.includes(MARKER)&&Number.isSafeInteger(i.number));
 if(healthy){if(existing)await request(BASE+'/'+existing.number,'PATCH',{state:'closed',state_reason:'completed'});return;}
 if(!existing)await request(BASE,'POST',{title:TITLE,body:MARKER+'\nThe scheduled sync health runner could not verify health or deliver/acknowledge its alert outbox. Check the Integration sync health Actions run and PEC-755. No customer payloads or credentials are included.'});
}
