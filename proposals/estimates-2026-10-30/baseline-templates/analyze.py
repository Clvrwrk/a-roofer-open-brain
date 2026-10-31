import re,json,csv,statistics as st,collections as C
from load import load
L=load('/workspace/agent-tools/68216d48-0034-474a-96d1-86d9a973e2d8.txt')
J=load('/workspace/agent-tools/5b196d19-3430-4e50-abc5-8a15bc62f0e2.txt')
OFF={'wichita':'Wichita KS','texas':'Richardson TX','colorado':'Denver CO','kansas_city':'Kansas City MO','georgia':'Atlanta GA','florida':'Pensacola FL','multi_family_commercial':'Multi-family/Commercial','insurance_program':'Insurance program'}
SH=[('Malarkey Vista AR',r'VISTA'),('Malarkey Highlander NEX AR',r'HIGHLANDER|HIGHLNDR|\bNEX\b'),('Malarkey Legacy',r'LEGACY'),
 ('GAF Timberline HDZ',r'HDZ'),('GAF Timberline UHDZ',r'UHDZ'),('GAF Timberline NS AR',r'NAT\w* SHAD|\bNS\b'),('GAF Timberline (other)',r'TIMB'),
 ('Tamko Titan XT',r'TITAN'),('Tamko Heritage',r'HERITAGE|TAMKO AR ELITE|\bHERIT'),('OC Duration',r'DURATION|TRUDEF'),('CertainTeed Landmark',r'LANDMARK'),
 ('CertainTeed Presidential',r'PRESIDENTIAL'),('Atlas Pinnacle',r'PINNACLE'),('IKO',r'\bIKO\b|DYNASTY|CAMBRIDGE')]
NOTSH=r'H&R|HIP|RIDGE|START|STRTR|STARTER|SEAL-A-RIDGE|PRO-START|TIMBERTEX|RIDGEFLEX'
def shingle(d,u):
    D=(d or '').upper()
    if re.search(NOTSH,D): return None
    if not re.search(r'BD|BDL|/S\b|/SQ|SQ',D+' '+(u or '').upper()) and (u or '').upper() not in ('BD','BDL','SQ'): return None
    for n,p in SH:
        if re.search(p,D): return n
    return None
COLORS=r'\b(NATRL|NATURAL|WOOD|STORM|GREY|GRAY|BRILL|BRILLIANT|BLCK|BLK|BLACK|OAK|WTHWD|WWOOD|WEATHERWOOD|WEATHERED|WTHRD|PLUS|HEATHER|ANTQ|ANT|ANTIQUE|BROWN|BRWN|RBRWN|SILVERWOOD|SIENNA|BLD|BLEND|CHARCOAL|SLATE|PEWTER|HICKORY|BARKWOOD|SHAKEWOOD|MISSION|DRIFTWOOD|ESTATE|RUSTIC|MOIRE|WHITE|BRONZE|BURNISHED|DARK|MILL|TBRNZ|BLACKEN\w*|HUNTER|GREEN|RED|TAN|IVORY|COLONIAL|DESERT|SAND\w*|COPPER|TERRA|CLAY|BEIGE|MAHOGANY|CEDAR|DUNE|PATRIOT|GLACIER|HEARTHSTONE|THUNDERSTORM|MOUNTAIN|COBBLESTONE|SHADOW|CLASSIC|ANTIQUE|AGED|SPRUCE)\b'
def norm(r):
    b=r.get('b')
    if b and not b.lower().startswith('miscellaneous') and b not in ('Delivery And Labor Charges',): base=b
    else:
        D=(r['d'] or '').upper(); D=re.sub(COLORS,' ',D); D=re.sub(r'[^A-Z0-9/"\.\-& ]',' ',D); base=re.sub(r'\s+',' ',D).strip()
        base=(b+': ' if b and b.lower().startswith('miscellaneous') else '')+base
    return re.sub(r'\s+',' ',base).strip().upper()
def uom(u):
    u=(u or '').upper(); return {'BDL':'BD','BUNDLE':'BD','RL':'RL','ROLL':'RL','PC':'EA','PCS':'EA'}.get(u,u)
jobs=C.defaultdict(list)
for r in L: jobs[(r['o'],r['j'])].append(r)
# primary shingle & squares
info={}
for k,rs in jobs.items():
    sh=C.defaultdict(lambda:[0,0,None])
    for r in rs:
        s=shingle(r['d'],r['u'])
        if s:
            sh[s][0]+=float(r['x'] or 0); sh[s][1]+=float(r['q'] or 0)
            m=re.search(r'(\d)\s*(?:BDL|BD)?\s*/\s*S',(r['d'] or '').upper()); sh[s][2]=int(m.group(1)) if m else 3
    if sh:
        p=max(sh,key=lambda s:(sh[s][0],sh[s][1])); bd=sh[p][1]; sq=bd/(sh[p][2] or 3) if uom(None)!='SQ' else bd
        info[k]=(p,sq)
    else: info[k]=(None,0)
def stats(keys):
    n=len(keys); cnt=C.Counter(); qps=C.defaultdict(list); up=C.defaultdict(list); u=C.defaultdict(C.Counter); ex=C.defaultdict(str)
    for k in keys:
        agg=C.defaultdict(lambda:[0,0])
        for r in jobs[k]:
            nk=norm(r); agg[nk][0]+=float(r['q'] or 0); agg[nk][1]+=float(r['x'] or 0); u[nk][uom(r['u'])]+=1; ex[nk]=ex[nk] or (r['d'] or '')
        sq=info[k][1]
        for nk,(q,x) in agg.items():
            cnt[nk]+=1
            if sq>0 and q>0: qps[nk].append(q/sq)
            if q>0 and x>0: up[nk].append(x/q)
    out=[]
    for nk,c in cnt.most_common():
        pct=c/n
        if pct<0.5: continue
        out.append(dict(line=nk,jobs_with=c,pct=round(100*pct,1),band='baseline' if pct>=.9 else ('common_optional' if pct>=.7 else 'frequent_50_70'),
          uom=u[nk].most_common(1)[0][0],median_qty_per_sq=round(st.median(qps[nk]),3) if qps[nk] else '',median_unit_price=round(st.median(up[nk]),2) if up[nk] else '',example_desc=ex[nk]))
    return n,out
groups=C.defaultdict(list)
for k,(p,sq) in info.items():
    groups[(OFF.get(k[0],k[0]),p or 'NO SHINGLE ON INVOICE')].append(k)
    groups[('ALL OFFICES',p or 'NO SHINGLE ON INVOICE')].append(k)
rows=[];summary=[]
for (o,p),ks in sorted(groups.items(),key=lambda x:(x[0][0],-len(x[1]))):
    n,out=stats(ks); summary.append(dict(office=o,shingle=p,n=n,low_conf=n<10,baseline=sum(1 for x in out if x['band']=='baseline'),optional=sum(1 for x in out if x['band']=='common_optional')))
    for x in out: rows.append(dict(office=o,shingle=p,n=n,low_confidence=n<10,**x))
with open('baseline-templates.csv','w',newline='') as f:
    w=csv.DictWriter(f,fieldnames=list(rows[0].keys())); w.writeheader(); w.writerows(rows)
# coverage + placeholders
jj={(r['o'],r['j']):r for r in J}
cov=C.defaultdict(lambda:C.Counter())
ph=[]
for k,r in jj.items():
    o=OFF.get(r['o'],r['o']); c=cov[o]; c['jobs_invoiced_any']+=1
    has_abc=k in jobs; c['abc_material_lines']+=has_abc; c['acx_invoice']+= r['acx_inv']>0
    c['primary_shingle_found']+= bool(has_abc and info[k][0])
    c['insurance_doc']+=r['ins_docs']>0; c['measurement_doc']+=r['meas_docs']>0; c['roofr_doc_or_row']+= (r['roofr_docs']>0 or r['roofr_rows']>0)
    for dt,have in [('supplier_material_invoice',has_abc),('customer_invoice_lines',r['acx_inv']>0),('insurance_scope',r['ins_docs']>0),('roofr_report',r['roofr_docs']>0 or r['roofr_rows']>0),('measurement_report_any',r['meas_docs']>0)]:
        ph.append(dict(job_number=r['j'],office=o,doc_type=dt,status='present' if have else 'missing',source='Supabase' if have else 'AccuLynx (not yet extracted)'))
with open('job-document-status.csv','w',newline='') as f:
    w=csv.DictWriter(f,fieldnames=list(ph[0].keys())); w.writeheader(); w.writerows(ph)
json.dump(dict(summary=summary,coverage={k:dict(v) for k,v in cov.items()},n_lines=len(L),n_jobs_abc=len(jobs)),open('results.json','w'),indent=1)
