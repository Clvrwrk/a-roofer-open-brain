import re,json,csv,statistics as st,collections as C
from load import load
from analyze import shingle,norm,uom,OFF
L=load('/workspace/agent-tools/252c1906-7dbd-48db-bcfc-7995f769038b.txt')
H={r['inv']:r for r in load('/workspace/agent-tools/615bf102-efc7-4fb6-b5bd-4b527a051a55.txt')}
JB=load('/workspace/agent-tools/e4524263-109b-4d87-9e02-b7ec475c5b43.txt')
S=load('/workspace/agent-tools/1261b17e-e85a-4690-905f-1ecc33a3c97a.txt')
JD=load('/workspace/agent-tools/5b196d19-3430-4e50-abc5-8a15bc62f0e2.txt')
PFX={'CO':'colorado','TX':'texas','KS':'wichita','KC':'kansas_city','GA':'georgia','FL':'florida','MC':'multi_family_commercial','INS':'insurance_program'}
INV={v:k for k,v in PFX.items()}
SCOPE=['colorado','texas','wichita','kansas_city']
jobs={r['j']:r for r in JB if r['j']}
def street_key(s):
    m=re.match(r'\s*(\d{2,6})\s+(?:[NSEW]\.?\s+)?([A-Z0-9]+)',(s or '').upper()); return (m.group(1),m.group(2)) if m else None
addr=C.defaultdict(set)
for j,r in jobs.items():
    k=street_key(r['s'])
    if k: addr[k].add(j)
RX=re.compile(r'\b(CO|TX|KS|KC|GA|FL|MC|INS)\s*-?\s*(\d{1,4})\b')
def office_of(h):
    a=(h['acct'] or '').upper()
    if 'DENVER' in a: return 'colorado'
    if 'DFW' in a: return 'texas'
    if 'WICHITA' in a: return 'wichita'
    if 'KC' in a: return 'kansas_city'
    if re.search('COMMERCIAL|SPEEDWAY|CHURCH',a): return 'multi_family_commercial'
    return {'CO':'colorado','TX':'texas','KS':'wichita','MO':'kansas_city','GA':'georgia','FL':'florida'}.get(h['bs'])
def match(po,jn,extra,off,ad):
    m=RX.search((po or '').upper())
    if m and m.start()<3 and f"{m[1]}-{m[2]}" in jobs: return f"{m[1]}-{m[2]}",'M1 PO job code (prefixed)'
    for t in [po,jn]+extra:
        m=RX.search((t or '').upper())
        if m and f"{m[1]}-{m[2]}" in jobs: return f"{m[1]}-{m[2]}",'M2 job code elsewhere on invoice'
    m=re.match(r'\s*(?:PO\s*#?\s*|JOB\s*#?\s*)?(\d{1,4})\b(?!\s+[A-Z]{2,}\s+(?:ST|RD|AVE|DR|LN|CT|WAY|PKWY|BLVD|CIR))',(po or '').upper())
    if m and off in INV and not re.match(r'\s*\d{3,6}\s+[A-Z]',(po or '').upper()):
        k=f"{INV[off]}-{int(m[1])}"
        if k in jobs: return k,'M3 bare job code + office of purchase'
    for t in [po,jn,ad]:
        k=street_key(t)
        if k and k in addr:
            c=[j for j in addr[k] if jobs[j]['o']==off] or list(addr[k])
            if len(c)==1: return c[0],'M4 job address (street no.+name)'
    return None,None
link={};meth=C.Counter();inv_off={}
for v,h in H.items():
    off=office_of(h); inv_off[v]=off
    j,mm=match(h['po'],h['jn'],[h['hpo'],h['oname']],off,h['hship'])
    if j: link[v]=j; meth[mm]+=1
# M5 credit memo -> original invoice
for v,h in H.items():
    if v not in link and h['oref']:
        o=h['oref'].rsplit('-',1)[0]
        cand=[x for x in H if x.startswith(o)]
        for c in cand:
            if c in link: link[v]=link[c]; meth['M5 credit memo → original invoice']+=1; break
unl=[v for v in H if v not in link]
meth['unmatched']=len(unl)
um=C.Counter(H[v]['tt'] for v in unl)
# SRS
srs_m=C.Counter(); srs_lines=[]
for r in S:
    off={'DJWIC':'wichita','AMDEN':'colorado','SHCOL':'colorado','SSCOP':'colorado','CDFTW':'texas','SSMEL':'texas'}.get(r['br'])
    j,mm=match(r['po'],r['jn'],[r['vjn']],off,(r['addr'] or '').replace('PRO EXTERIORS LLC',''))
    srs_m[mm or 'unmatched']+=1
    if j:
        sg=-1 if r['doc_type']=='credit' else 1
        for l in r['lines'] or []:
            q=float(l['q'] or 0); x=float(l['x'] or 0)
            if sg<0: q=-abs(q); x=-abs(x)
            srs_lines.append(dict(j=j,b=None,d=l['d'],u=l['u'],q=q,x=x,src='SRS'))
# function families (cross-supplier)
FAM=[('Field shingle',None),('Hip & ridge',r'H&R|HIP|RIDGE|RIDGEFLEX|SEAL-A-RIDGE|TIMBERTEX'),('Starter',r'START|STRTR|STARTER'),
 ('Ice & water underlayment',r'ARCTIC SEAL|ICE|WATERGUARD|WEATHERWATCH|STORMGUARD|LEAKBARRIER|I&W|SELF.?ADH'),('Synthetic underlayment',r'SYNTH|PRO GUARD|ANCHORDECK|TS20|FELTBUSTER|DECK.?ARMOR|UNDERLAY|UNDRLY'),
 ('Coil nails',r'COIL'),('Cap nails',r'CAP NAIL|PLASTIC CAP'),('Touch-up paint',r'PAINT'),('Sealant / caulk',r'SEAL|CAULK|GEOCEL|NP1|TUBE'),
 ('Drip edge / apron',r'DRIP|APRON|METAL EDGE|GRAVEL STOP|EAVE'),('Step flashing',r'STEP FL'),('Flashing (other)',r'FLASH|PIPE BOOT|BOOT|COUNTER|VALLEY'),
 ('Roof vents',r'VENT|LOUVER|TURBINE|RIDGE VENT|OFF.?RIDGE'),('Screws / fasteners',r'SCREW|NAIL'),('Delivery / fees',r'DELIVER|FUEL|FEE|SURCHARGE|LABOR'),('Lumber / decking',r'OSB|PLYWOOD|DECK|LUMBER|1X|2X')]
def fam(r):
    if shingle(r['d'],r['u']): return 'Field shingle'
    s=((r.get('b') or '')+' '+(r['d'] or '')).upper()
    for f,p in FAM[1:]:
        if re.search(p,s): return f
    return 'Other: '+norm(r)[:40]
# per-job netted lines
jl=C.defaultdict(list)
for l in L:
    if l['v'] in link: jl[link[l['v']]].append(dict(l,src='ABC'))
for l in srs_lines: jl[l['j']].append(l)
info={}
for j,rs in jl.items():
    sh=C.defaultdict(lambda:[0,0,3])
    for r in rs:
        s=shingle(r['d'],r['u'])
        if s:
            sh[s][0]+=float(r['x'] or 0); sh[s][1]+=float(r['q'] or 0)
            m=re.search(r'(\d)\s*(?:BDL|BD)?\s*/\s*S',(r['d'] or '').upper()); sh[s][2]=int(m.group(1)) if m else 3
    sh={k:v for k,v in sh.items() if v[1]>0}
    if sh: p=max(sh,key=lambda s:(sh[s][0],sh[s][1])); info[j]=(p,sh[p][1]/sh[p][2])
    else: info[j]=(None,0)
def stats(keys,level):
    n=len(keys);cnt=C.Counter();qps=C.defaultdict(list);up=C.defaultdict(list);u=C.defaultdict(C.Counter);ex={};brand=C.defaultdict(C.Counter)
    for k in keys:
        agg=C.defaultdict(lambda:[0,0])
        for r in jl[k]:
            nk=fam(r) if level=='family' else norm(r)
            agg[nk][0]+=float(r['q'] or 0); agg[nk][1]+=float(r['x'] or 0); u[nk][uom(r['u'])]+=1; ex.setdefault(nk,r['d'] or ''); brand[nk][norm(r)[:45]]+=1
        sq=info[k][1]
        for nk,(q,x) in agg.items():
            if q<=0: continue   # netted out by credits
            cnt[nk]+=1
            if sq>0: qps[nk].append(q/sq)
            if x>0: up[nk].append(x/q)
    out=[]
    for nk,c in cnt.most_common():
        p=c/n
        if p<.5: continue
        out.append(dict(line=nk,jobs_with=c,pct=round(100*p,1),band='baseline' if p>=.9 else 'common_optional' if p>=.7 else 'frequent_50_70',uom=u[nk].most_common(1)[0][0],
            median_qty_per_sq=round(st.median(qps[nk]),3) if qps[nk] else '',median_unit_price=round(st.median(up[nk]),2) if up[nk] else '',top_product=brand[nk].most_common(1)[0][0],example_desc=ex[nk]))
    return n,out
groups=C.defaultdict(list)
for j,(p,sq) in info.items():
    o=jobs[j]['o']
    if o in SCOPE: groups[(OFF[o],p or 'NO SHINGLE ON INVOICE')].append(j)
rows=[];summ=[]
for (o,p),ks in sorted(groups.items(),key=lambda x:(x[0][0],-len(x[1]))):
    for lvl in ('family','product'):
        n,out=stats(ks,lvl)
        for x in out: rows.append(dict(level=lvl,office=o,shingle=p,n=n,low_confidence=n<10,**x))
        if lvl=='product': summ.append(dict(office=o,shingle=p,n=n,low_conf=n<10,baseline=sum(x['band']=='baseline' for x in out),optional=sum(x['band']=='common_optional' for x in out)))
with open('baseline-templates-v2.csv','w',newline='') as f:
    w=csv.DictWriter(f,fieldnames=list(rows[0].keys())); w.writeheader(); w.writerows(rows)
# coverage + placeholders
jd={r['j']:r for r in JD}
cov=C.defaultdict(C.Counter);ph=[]
alljobs=set(jl)|{r['j'] for r in JD}
for j in sorted(alljobs):
    if j not in jobs or jobs[j]['o'] not in SCOPE: continue
    o=OFF[jobs[j]['o']]; r=jd.get(j,{}); c=cov[o]; c['jobs']+=1
    has=j in jl; srs=any(x['src']=='SRS' for x in jl.get(j,[]))
    c['supplier_lines']+=has; c['srs_lines']+=srs; c['shingle_found']+=bool(has and info[j][0]); c['acx_invoice']+=r.get('acx_inv',0)>0
    c['insurance_doc']+=r.get('ins_docs',0)>0; c['roofr']+=(r.get('roofr_docs',0)>0 or r.get('roofr_rows',0)>0)
    for dt,hv,srcm in [('supplier_material_invoice_abc',any(x['src']=='ABC' for x in jl.get(j,[])),'ABC'),('supplier_material_invoice_srs',srs,'SRS'),('customer_invoice_lines',r.get('acx_inv',0)>0,'AccuLynx'),('insurance_scope',r.get('ins_docs',0)>0,'AccuLynx'),('roofr_report',r.get('roofr_docs',0)>0 or r.get('roofr_rows',0)>0,'AccuLynx/Roofr')]:
        ph.append(dict(job_number=j,office=o,doc_type=dt,status='present' if hv else 'missing',source='Supabase' if hv else srcm+' (not yet extracted)'))
with open('job-document-status-v2.csv','w',newline='') as f:
    w=csv.DictWriter(f,fieldnames=list(ph[0].keys())); w.writeheader(); w.writerows(ph)
json.dump(dict(methods=dict(meth),unmatched_by_type=dict(um),srs_methods=dict(srs_m),n_inv=len(H),n_srs=len(S),linked_inv=len(link),jobs_linked=len(jl),coverage={k:dict(v) for k,v in cov.items()},summary=summ,
  unmatched_by_office=dict(C.Counter(OFF.get(inv_off[v],str(inv_off[v])) for v in unl))),open('results-v2.json','w'),indent=1)
