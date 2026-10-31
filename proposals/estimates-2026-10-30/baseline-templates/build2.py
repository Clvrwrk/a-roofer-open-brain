import json,csv,html,subprocess
R=json.load(open('results-v2.json')); rows=list(csv.DictReader(open('baseline-templates-v2.csv')))
M=R['methods']; tot=R['n_inv']
mt="| Method | ABC invoices matched | % of 2,798 |\n|---|---|---|\n"+"".join(f"| {k} | {v} | {100*v/tot:.1f}% |\n" for k,v in M.items())
ct="| Office | Jobs with any invoice | Jobs with supplier lines (ABC+SRS) | …with SRS lines | Primary shingle found | Insurance doc | Roofr |\n|---|---|---|---|---|---|---|\n"+"".join(f"| {o} | {c['jobs']} | {c['supplier_lines']} | {c['srs_lines']} | {c['shingle_found']} | {c['insurance_doc']} | {c['roofr']} |\n" for o,c in R['coverage'].items())
v1={'Denver CO':(261,225),'Richardson TX':(149,132),'Wichita KS':(121,104),'Kansas City MO':(8,7)}
dt="| Office | v1 supplier-line jobs → v2 | v1 shingle jobs → v2 |\n|---|---|---|\n"+"".join(f"| {o} | {v1[o][0]} → {R['coverage'][o]['supplier_lines']} | {v1[o][1]} → {R['coverage'][o]['shingle_found']} |\n" for o in v1)
sm="| Office | Shingle | n | Product baseline lines | Common optional | Confidence |\n|---|---|---|---|---|---|\n"+"".join(f"| {s['office']} | {s['shingle']} | {s['n']} | {s['baseline']} | {s['optional']} | {'LOW (n<10)' if s['low_conf'] else 'ok'} |\n" for s in R['summary'] if s['n']>=3)
def sec(o,s):
    rs=[r for r in rows if r['level']=='family' and r['office']==o and r['shingle']==s and r['band']!='frequent_50_70']
    if not rs: return ''
    n=rs[0]['n']; t=f"\n### {o} · {s} (n={n}){' **LOW CONFIDENCE**' if int(n)<10 else ''}\n| Family | % jobs | Band | Top product | UoM | Median qty/sq | Median unit $ |\n|---|---|---|---|---|---|---|\n"
    return t+"".join(f"| {r['line']} | {r['pct']}% | {'**baseline**' if r['band']=='baseline' else 'optional'} | {r['top_product']} | {r['uom']} | {r['median_qty_per_sq']} | {r['median_unit_price']} |\n" for r in rs)
G=[('Denver CO','Malarkey Vista AR'),('Denver CO','Malarkey Legacy'),('Richardson TX','Malarkey Vista AR'),('Richardson TX','Malarkey Highlander NEX AR'),('Richardson TX','Tamko Heritage'),('Wichita KS','Malarkey Highlander NEX AR'),('Wichita KS','Malarkey Vista AR'),('Wichita KS','GAF Timberline NS AR'),('Kansas City MO','Malarkey Vista AR'),('Kansas City MO','Malarkey Highlander NEX AR')]
md=f"""# Baseline estimate templates v2: full-invoice rematch + SRS (2026-10-30)

Chris t73u: "Look at the entire invoice. There may be a reference to a job if these are credit memos. On every invoice there is an office of purchase, which establishes the location, and a jobid code." He also asked to include SRS and to scope this to **Denver, Richardson, Wichita and Kansas City**. Pensacola, Multi-family, Insurance and Atlanta are skipped. Everything here is READ-ONLY.

![Pipeline v2](baseline-pipeline-v2.svg)

## 1. Fields found on the full invoice
| Need | Field (Supabase) |
|---|---|
| Office of purchase / location | `abc_line_items.branch_number` + `branch_state`; header `abc_invoices.raw->branch` (number, name, city, state). The ABC sub-account `abc_account_name` is the office account: *Denver Co Account* (2036874-9) = Denver, *DFW Account* (-2) = Richardson, *Storm/wichita* (-16) = Wichita, *STORM North KC* (-20) = Kansas City, *Commercial* / *Texas Motor Speedway* = MF. Generic "PRO EXTERIORS LLC / 930014…" accounts fall back to the branch state (MO → KC). |
| Job ID code | `customer_po` (main), header `purchase_order_number`, `order_name`, line `job_name`. Codes appear as `CO-189`, `TX216`, `AUSTINTX-318`, `PO 188: NAME`, or a bare `180` with the office implied. |
| Credit memo → original | `abc_invoices.is_credit_memo`, `original_invoice_reference` (`2005594507-1` → invoice `2005594507-001`), `raw.creditRebillReason`. Only 83 headers carry a reference, and the header table covers only part of the line data. |
| Address | `abc_line_items.shipping_address`, header `raw.shipTo.addressLine1` (often the office address, so it's used only after the job code). |
| SRS | `vendor_invoices` + `vendor_invoice_lines` (vendor = SRS Distribution): **91 docs (59 invoices, 32 credits), 726 lines, 2026-06-18 → 2026-10-20**. `po_number` holds the job code. `branch_key` (DJWIC = Wichita, AMDEN/SHCOL/SSCOP = Denver, CDFTW/SSMEL = DFW). Also `qbo_registers."SRS Distribution"` (91 register rows, no item lines). |

**AccuLynx note:** 6,088 of 7,419 jobs in `acculynx_jobs` have a **blank job_number** (leads that never got a number). Only numbered jobs can match. Kansas City's prefix is **`KC-`** (verified), not MO.

## 2. Match rates (ABC, 2,798 invoices)
{mt}
- Order of methods: M1 → M2 → M3 (a bare code turned into `PREFIX-n` using the office of purchase, accepted only if that job exists) → M4 (house number + street name match AccuLynx `location_street1`, unique within the office) → M5 (credit memo inherits the job of its original invoice).
- **Linked: {R['linked_inv']} / 2,798 invoices (v1: 1,930), giving {R['jobs_linked']} jobs.**
- **Still unmatched (699):** Will Call 211, Delivery 168, Express Pickup 124, Adjustment 112, Credit Memo 80, Debit Memo 4. By office: Richardson 466, Denver 106, MF 62, Atlanta 29, Wichita 25, unknown 11. Most have a person's name, "SHOP"/"RUSH", or a house address with no matching AccuLynx job number. Those jobs are likely un-numbered leads or shop stock.
- **SRS:** 88 of 91 docs matched by PO job code, 1 by address, 2 unmatched.
- Medium confidence: M3 (36) and M4 (111). Spot-check these before training.

**Credit netting:** credit-memo and SRS-credit lines are negative and summed per job × line before counting. A line counts as "present" only if its net qty > 0. Some jobs are fully reversed by a credit and drop out, which is why "no shingle" jobs rose (Wichita 17 → 49, mostly accessory-only and return-netted jobs).

## 3. Coverage (in-scope offices)
{ct}
**Change vs v1:**
{dt}
**Kansas City is still too thin:** 8 jobs with supplier lines, 7 with a shingle (Vista and Highlander have fewer than 5 each). KC POs mostly use the generic accounts or carry no code. Getting KC to n≥10 needs AccuLynx job numbers on KC POs, or the extraction bot below (material orders and work orders attached in AccuLynx).

## 4. Group summary (product level, in scope)
{sm}
## 5. Templates. Family level (cross-supplier: ABC + SRS map to the same function family) is the template the estimate agent uses; product level is in the CSV.
SRS names are mapped to families with the same rules (e.g. TOP SHIELD STARTER STRIP → Starter, TS20 SYNTHETIC → Synthetic underlayment, ICE & WATER DEFENDER → Ice & water, METAL EDGE → Drip edge). The shingle family is identified with the same shingle regex, so `MALARKEY VISTA AR … 3 BD/SQ` → Malarkey Vista AR.
{''.join(sec(o,s) for o,s in G)}
**Changes at product level vs v1 (n≥10):**
- Dropped below 90%:
  - Denver Vista: ABC coil nails (87.5%; now covered at family level 96.5% via other nail SKUs).
  - Denver Legacy: Pro Guard 20 (89.5%).
  - Wichita Vista: GAP Waterguard (88.9%).
  - Wichita GAF NS: Roofnado, touch-up paint, Waterguard, cap nails (78–89%). SRS jobs use Top Shield equivalents, which the **family** view fixes.
- At family level, most groups now have 10–13 baseline families (Denver Vista 13, Wichita Vista 12, Richardson Vista 11).

## 6. Placeholders and the extraction-bot spec (update to v1 §6)
- `job-document-status-v2.csv` has one row per in-scope job × doc type: `supplier_material_invoice_abc`, `supplier_material_invoice_srs`, `customer_invoice_lines`, `insurance_scope`, `roofr_report`. Missing docs are written as `status=missing`, `source=<ABC|SRS|AccuLynx> (not yet extracted)`, never as zero.
- Add to the bot spec:
  - **SRS** as a supplier source: `vendor_invoices`/`vendor_invoice_lines` already exist (since 2026-06-18). Backfill SRS history before June 2026 from the SRS portal or PDFs into the same tables.
  - Map `branch_key` → office in `vendor_branch_code_map`.
  - Require `po_number` = AccuLynx job number at order time (the forward fix).
  - Pull AccuLynx **job numbers** for the 6,088 un-numbered jobs if they're assigned later.

## Evidence
Read-only queries over `abc_line_items` (16,282 lines / 2,798 invoices), `abc_invoices` (1,216 headers, 274 credit memos, 83 with an original reference), `vendor_invoices`/`vendor_invoice_lines` SRS (91 / 726) and `acculynx_jobs` (7,419; 1,331 numbered). Scripts: `analyze2.py`, `build2.py`.
"""
open('baseline-templates-v2-2026-10-30.md','w').write(md)
B=[("ABC 2,798 inv\n+ SRS 91 docs",'#a5d8ff'),("Match: PO code, code\nelsewhere, bare code\n+office, address, CM→orig",'#b2f2bb'),("Net credits\nper job × line",'#ffec99'),("Office × shingle\nfamily % of jobs",'#ffc9c9'),("≥90% baseline\n70–90% optional",'#d0bfff')]
exec(open('build.py').read().split('# excalidraw diagram')[1].split('# svg mirror')[0].replace("B=[","B0=[").replace("box(250,210","B=B; box(250,210") if False else '')
els=[];sid=[1]
def box(x,y,w,h,t,c):
    i=f"b{sid[0]}";sid[0]+=1
    els.append(dict(type='rectangle',id=i,x=x,y=y,width=w,height=h,strokeColor='#1e1e1e',backgroundColor=c,fillStyle='solid',strokeWidth=2,roughness=1,opacity=100,angle=0,seed=sid[0],version=1,versionNonce=sid[0],isDeleted=False,groupIds=[],boundElements=[],roundness={'type':3},locked=False,updated=1,link=None,frameId=None,strokeStyle='solid'))
    els.append(dict(type='text',id=i+'t',x=x+10,y=y+10,width=w-20,height=h-20,text=t,fontSize=16,fontFamily=1,textAlign='center',verticalAlign='middle',strokeColor='#1e1e1e',backgroundColor='transparent',fillStyle='solid',strokeWidth=1,roughness=1,opacity=100,angle=0,seed=sid[0]+99,version=1,versionNonce=sid[0]+99,isDeleted=False,groupIds=[],boundElements=[],containerId=None,originalText=t,lineHeight=1.25,locked=False,updated=1,link=None,frameId=None,roundness=None,strokeStyle='solid'))
def arrow(x1,y1,x2,y2):
    sid[0]+=1; els.append(dict(type='arrow',id=f"a{sid[0]}",x=x1,y=y1,width=x2-x1,height=y2-y1,points=[[0,0],[x2-x1,y2-y1]],strokeColor='#1e1e1e',backgroundColor='transparent',fillStyle='solid',strokeWidth=2,roughness=1,opacity=100,angle=0,seed=sid[0],version=1,versionNonce=sid[0],isDeleted=False,groupIds=[],boundElements=[],roundness={'type':2},locked=False,updated=1,link=None,frameId=None,strokeStyle='solid',startBinding=None,endBinding=None,startArrowhead=None,endArrowhead='arrow',lastCommittedPoint=None))
for k,(t,c) in enumerate(B):
    box(20+k*230,40,200,120,t,c)
    if k: arrow(20+k*230-30,100,20+k*230,100)
box(250,220,430,90,"Missing docs → PLACEHOLDER rows\n(ABC / SRS / AccuLynx extraction bot)",'#e9ecef'); arrow(1040,160,690,240)
box(250,360,430,80,"Good / Better / Best per office\nCO · TX · KS · KC",'#c3fae8'); arrow(465,310,465,360)
json.dump(dict(type='excalidraw',version=2,source='https://excalidraw.com',elements=els,appState=dict(viewBackgroundColor='#ffffff',gridSize=None),files={}),open('baseline-pipeline-v2.excalidraw','w'),indent=1)
s=['<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="460" font-family="Virgil,Segoe UI,sans-serif" font-size="14"><defs><marker id="m2" markerWidth="10" markerHeight="10" refX="9" refY="5" orient="auto"><path d="M0,0L10,5L0,10z"/></marker></defs><rect width="1200" height="460" fill="#fff"/>']
for e in els:
    if e['type']=='rectangle': s.append(f'<rect x="{e["x"]}" y="{e["y"]}" width="{e["width"]}" height="{e["height"]}" rx="12" fill="{e["backgroundColor"]}" stroke="#1e1e1e" stroke-width="2"/>')
    elif e['type']=='text':
        ls=e['text'].split('\n'); cy=e['y']+e['height']/2-(len(ls)-1)*9
        for i,l in enumerate(ls): s.append(f'<text x="{e["x"]+e["width"]/2}" y="{cy+i*18+5}" text-anchor="middle">{html.escape(l)}</text>')
    else: s.append(f'<line x1="{e["x"]}" y1="{e["y"]}" x2="{e["x"]+e["width"]}" y2="{e["y"]+e["height"]}" stroke="#1e1e1e" stroke-width="2" marker-end="url(#m2)"/>')
svg='\n'.join(s+['</svg>']); open('baseline-pipeline-v2.svg','w').write(svg)
body=subprocess.run(['python3','-c','import markdown;print(markdown.markdown(open("baseline-templates-v2-2026-10-30.md").read(),extensions=["tables"]))'],capture_output=True,text=True).stdout
body=body.replace('<img alt="Pipeline v2" src="baseline-pipeline-v2.svg" />',svg)
open('baseline-templates-v2-2026-10-30.html','w').write(f'<!doctype html><html><head><meta charset="utf-8"><title>Baseline templates v2</title><style>body{{font-family:system-ui;max-width:1100px;margin:auto;padding:20px}}table{{border-collapse:collapse;font-size:13px;margin:8px 0}}td,th{{border:1px solid #ccc;padding:3px 6px}}th{{background:#f1f3f5}}svg{{max-width:100%;height:auto}}</style></head><body>{body}</body></html>')
print('ok',body.count('<svg'))
