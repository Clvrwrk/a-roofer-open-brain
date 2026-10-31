import json,csv,html,random
R=json.load(open('results.json')); rows=list(csv.DictReader(open('baseline-templates.csv')))
cov=R['coverage']
def sec(o,s):
    rs=[r for r in rows if r['office']==o and r['shingle']==s and r['band'] in('baseline','common_optional')]
    if not rs: return ''
    n=rs[0]['n']; lc=' **(LOW CONFIDENCE, n<10)**' if int(n)<10 else ''
    t=f"\n### {o} · {s} (n={n} jobs){lc}\n| Line (normalized) | % jobs | Band | UoM | Median qty/sq | Median unit $ |\n|---|---|---|---|---|---|\n"
    for r in rs: t+=f"| {r['line']} | {r['pct']}% | {'**baseline**' if r['band']=='baseline' else 'common optional'} | {r['uom']} | {r['median_qty_per_sq']} | {r['median_unit_price']} |\n"
    return t
groups=[('Denver CO','Malarkey Vista AR'),('Denver CO','Malarkey Legacy'),('Denver CO','OC Duration'),('Richardson TX','Malarkey Vista AR'),('Richardson TX','Malarkey Highlander NEX AR'),('Richardson TX','Tamko Heritage'),('Wichita KS','Malarkey Highlander NEX AR'),('Wichita KS','Malarkey Vista AR'),('Wichita KS','GAF Timberline NS AR'),('Kansas City MO','Malarkey Vista AR'),('Atlanta GA','GAF Timberline HDZ'),('ALL OFFICES','Malarkey Vista AR'),('ALL OFFICES','Malarkey Highlander NEX AR'),('ALL OFFICES','Malarkey Legacy'),('ALL OFFICES','GAF Timberline NS AR')]
covt="| Office | Jobs with any invoice | Jobs with ABC material invoice lines | …with primary shingle found | AccuLynx customer invoice | Insurance doc in Supabase | Measurement doc | Roofr report/row |\n|---|---|---|---|---|---|---|---|\n"
for o,c in cov.items(): covt+=f"| {o} | {c.get('jobs_invoiced_any',0)} | {c.get('abc_material_lines',0)} | {c.get('primary_shingle_found',0)} | {c.get('acx_invoice',0)} | {c.get('insurance_doc',0)} | {c.get('measurement_doc',0)} | {c.get('roofr_doc_or_row',0)} |\n"
summ="| Office | Shingle | n jobs | Baseline lines (≥90%) | Common optional (70–90%) | Confidence |\n|---|---|---|---|---|---|\n"+"".join(f"| {s['office']} | {s['shingle']} | {s['n']} | {s['baseline']} | {s['optional']} | {'LOW (n<10)' if s['low_conf'] else 'ok'} |\n" for s in R['summary'] if s['office']!='ALL OFFICES')
md=f"""# Baseline estimate templates from invoice line items (2026-10-30)

Chris (t59u): for each office's shingle, which invoice lines appear on ≥90% of jobs? Those lines are the baseline template. All work was **read-only** (Supabase project "Pro Exteriors LLC - Agent Workforce"). No writes, no money spent, no outside messages.

![Pipeline](baseline-pipeline.svg)

## 1. Where the invoice line items live
| Source | What it is | Used? |
|---|---|---|
| `public.abc_line_items` (16,282 lines, 2,798 ABC supplier invoices, Jan 2023 to May 2026) | Itemized **material** invoices from ABC Supply. Each has a qty, UoM, $ and brand line. | **Yes.** This is the template source. |
| `public.acculynx_invoices.raw->sections->items` (1,966 invoices on 1,095 jobs) | AccuLynx **customer** invoices. These are lump-sum scope lines ("R&R Roofing System", "ACV", "Debris Removal") with no quantities. | Coverage only. No line reaches 50% in any office (Wichita's top is 47%), so there's no baseline here. |
| `public.acculynx_invoice_lines` | Intended line table | **Empty (0 rows)** |

**Job link:** the ABC `customer_po` is normalized (`TX216`, `tx - 216`, `CO-189: name` → `TX-216`/`CO-189`) and matched exactly to `acculynx_jobs.job_number`. 1,930 of 2,798 invoices (12,399 lines) match 575 jobs with **0 duplicate matches**. Credits and returns are excluded. That leaves 9,424 job×item rows on 572 jobs. The 3,642 lines whose PO has no office prefix (house numbers or names only) are **not linked**. **Office** = AccuLynx `account_key` (texas = Richardson).

**Primary shingle** = the field-shingle line with the largest $ on the job's ABC invoices. Starter, hip & ridge and Seal-A-Ridge lines are excluded. **Squares** = shingle bundles ÷ bundles-per-sq (taken from the description, default 3).

**Normalization:** use ABC's `product_brand_line` when it's specific. It already merges colors and sizes ("Malarkey Vista", "ABC Coil Nails - Catalog"). Otherwise use the description, uppercased, with color words (Natural Wood, Storm Grey, Brill Blck, Weatherwood, …) stripped and whitespace collapsed. Generic "Miscellaneous …" brand lines keep the cleaned description as a suffix. UoM aliases: BDL→BD, PC/PCS→EA. Jobs with several invoices (supplements, returns) are combined into one job before counting. % = jobs containing the line ÷ jobs in the group.

**Caveat:** these are supplier material lines. Labor, tear-off, dump, permit and overhead are **not** on ABC invoices. They have to come from the labor/sub side or the price agreements (next phase).

## 2. Coverage
{covt}
- **Gaps:** Pensacola (2 ABC jobs, 0 with shingle), Insurance program (0), Atlanta (16 jobs / 6 with shingle), Multi-family (15 / 6) and Kansas City (8 / 7) are too thin to template. They likely use other suppliers (SRS, Beacon, local) or POs without a prefix.
- 92 matched jobs have no field shingle on their ABC invoices (accessory or re-order invoices only).
- Insurance docs, Roofr reports and other measurement docs are in Supabase for only ~45 jobs. Every gap is a **PLACEHOLDER** row (`status=missing, source=AccuLynx (not yet extracted)`) in `job-document-status.csv`. A gap is never counted as zero.

## 3. Group summary
{summ}
## 4. Baseline (≥90%) and common-optional (70–90%) lines
Median qty/sq is per roof square of the primary shingle. The shingle itself is 3.0 BD/sq by definition. Unit $ is the ABC invoiced price (cost side).
{''.join(sec(o,s) for o,s in groups)}
Full detail (≥50% band too, all groups) is in `baseline-templates.csv`.

## 5. Next-phase inventory: insurance docs and Roofr (counts only)
- `acculynx_job_documents`: 1,220 docs on ~110 jobs. Types: insurance 106 docs / 55 jobs, measurement 202 / 64, material 105 / 35, contract 134 / 56, unsorted 371 / 54. Most have extracted text.
- `roofr_measurements`: **5 rows** (2 link to an invoiced job via property).
- `acculynx_job_insurance` has a row for nearly every job, but `has_paperwork` is true on only ~170. The claim fields are unreliable as a "doc exists" signal.
- So matching insurance docs and Roofr reports to the template jobs needs the extraction bot below first.

## 6. Spec: AccuLynx document-extraction bot (to train next)
Key everything on `job_number` (with `acculynx_job_id` and `account_key`). Store in Supabase, read by the estimate agent.

**Table `estimate_training_documents`** (one row per job × doc): `job_number, acculynx_job_id, account_key, doc_type (enum below), status (present|missing|unreadable), source (acculynx|roofr_api|gaf|eagleview|drone|abc|manual), source_document_key, storage_path, sha256, page_count, text_content, extracted_at, extractor_version, confidence`.

| doc_type | Fields to extract (child table) |
|---|---|
| `supplier_material_invoice` (ABC, SRS, Beacon) | `doc_lines`: invoice_number, invoice_date, supplier, item_number, description, brand_line, color, qty, uom, unit_price, ext_price, po_number |
| `customer_invoice` / `final_invoice` | invoice_number, date, total, balance, lines(name, qty, unit, price), supplements |
| `insurance_scope` (Xactimate / carrier estimate) | carrier, claim_number, date_of_loss, price_list (e.g. TXDF8X_OCT26), RCV, ACV, depreciation, deductible, O&P flag; lines: xact_code (e.g. RFG 300S), description, qty, unit, unit_price, RCV, depreciation, ACV, section (roof/gutters/siding) |
| `roofr_report` / `eagleview` / `gaf_quickmeasure` / `drone` | report_id, total_sqft, pitched/flat sqft, squares @0/10/15% waste, predominant_pitch, pitch_breakdown, facets, eaves/rakes/ridges/hips/valleys/step & wall flashing LF, stories, layers |
| `contract` / `proposal` | signed_date, price, selected option (good/better/best), shingle product+color, line items |
| `supplement` | requested items, approved items, delta $ |
| `work_order` / `material_order` | order lines (as supplier lines), delivery date |

Rules: write a `status=missing` placeholder for every expected type per sold job, so gaps stay visible. Normalize lines with the same rules as §1. Never overwrite source data. Use a doc-type classifier first, then type-specific extraction, then a human audit queue for confidence < 0.8.

## Evidence
Read-only queries: 12,399 matched ABC lines → 1,930 invoices → 575 jobs (572 after excluding credits). Customer invoices: 1,966 on 1,095 jobs. Docs: 1,220. Roofr rows: 5. Scripts: `analyze.py`, `build.py`.
"""
open('baseline-templates-2026-10-30.md','w').write(md)
# excalidraw diagram
els=[];sid=1
def box(x,y,w,h,t,c):
    global sid
    i=f"b{sid}";sid+=1
    els.append(dict(type='rectangle',id=i,x=x,y=y,width=w,height=h,strokeColor='#1e1e1e',backgroundColor=c,fillStyle='solid',strokeWidth=2,roughness=1,opacity=100,angle=0,seed=sid,version=1,versionNonce=sid,isDeleted=False,groupIds=[],boundElements=[],roundness={'type':3},locked=False,updated=1,link=None,frameId=None,strokeStyle='solid'))
    els.append(dict(type='text',id=i+'t',x=x+10,y=y+10,width=w-20,height=h-20,text=t,fontSize=16,fontFamily=1,textAlign='center',verticalAlign='middle',strokeColor='#1e1e1e',backgroundColor='transparent',fillStyle='solid',strokeWidth=1,roughness=1,opacity=100,angle=0,seed=sid+99,version=1,versionNonce=sid+99,isDeleted=False,groupIds=[],boundElements=[],containerId=None,originalText=t,lineHeight=1.25,locked=False,updated=1,link=None,frameId=None,roundness=None,strokeStyle='solid'))
def arrow(x1,y1,x2,y2):
    global sid; sid+=1
    els.append(dict(type='arrow',id=f"a{sid}",x=x1,y=y1,width=x2-x1,height=y2-y1,points=[[0,0],[x2-x1,y2-y1]],strokeColor='#1e1e1e',backgroundColor='transparent',fillStyle='solid',strokeWidth=2,roughness=1,opacity=100,angle=0,seed=sid,version=1,versionNonce=sid,isDeleted=False,groupIds=[],boundElements=[],roundness={'type':2},locked=False,updated=1,link=None,frameId=None,strokeStyle='solid',startBinding=None,endBinding=None,startArrowhead=None,endArrowhead='arrow',lastCommittedPoint=None))
B=[("ABC invoice lines\n16,282 lines / 2,798 inv",'#a5d8ff'),("PO → job_number\n575 jobs matched",'#b2f2bb'),("Office (account_key)\n+ primary shingle",'#ffec99'),("% of jobs per line\n≥90% baseline\n70–90% optional",'#ffc9c9'),("Baseline template\nqty/sq + unit $",'#d0bfff')]
for k,(t,c) in enumerate(B):
    box(20+k*230,40,200,110,t,c)
    if k: arrow(20+k*230-30,95,20+k*230,95)
box(250,210,430,90,"NEXT: insurance scope + Roofr per job\n(missing → PLACEHOLDER, extraction bot)",'#e9ecef'); arrow(1040,150,690,230)
box(250,350,430,80,"Good / Better / Best estimates\n~90% complete → sales audits edge cases",'#c3fae8'); arrow(465,300,465,350)
json.dump(dict(type='excalidraw',version=2,source='https://excalidraw.com',elements=els,appState=dict(viewBackgroundColor='#ffffff',gridSize=None),files={}),open('baseline-pipeline.excalidraw','w'),indent=1)
# svg mirror
s=['<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="450" font-family="Virgil,Segoe UI,sans-serif" font-size="14"><defs><marker id="m" markerWidth="10" markerHeight="10" refX="9" refY="5" orient="auto"><path d="M0,0L10,5L0,10z"/></marker></defs><rect width="1200" height="450" fill="#fff"/>']
for e in els:
    if e['type']=='rectangle': s.append(f'<rect x="{e["x"]}" y="{e["y"]}" width="{e["width"]}" height="{e["height"]}" rx="12" fill="{e["backgroundColor"]}" stroke="#1e1e1e" stroke-width="2"/>')
    elif e['type']=='text':
        ls=e['text'].split('\n'); cy=e['y']+e['height']/2-(len(ls)-1)*9
        for i,l in enumerate(ls): s.append(f'<text x="{e["x"]+e["width"]/2}" y="{cy+i*18+5}" text-anchor="middle">{html.escape(l)}</text>')
    else: s.append(f'<line x1="{e["x"]}" y1="{e["y"]}" x2="{e["x"]+e["width"]}" y2="{e["y"]+e["height"]}" stroke="#1e1e1e" stroke-width="2" marker-end="url(#m)"/>')
s.append('</svg>'); svg='\n'.join(s); open('baseline-pipeline.svg','w').write(svg)
import subprocess
body=subprocess.run(['python3','-c','import markdown,sys;print(markdown.markdown(open("baseline-templates-2026-10-30.md").read(),extensions=["tables"]))'],capture_output=True,text=True).stdout
body=body.replace('<img alt="Pipeline" src="baseline-pipeline.svg" />',svg)
open('baseline-templates-2026-10-30.html','w').write(f'<!doctype html><html><head><meta charset="utf-8"><title>Baseline estimate templates 2026-10-30</title><style>body{{font-family:system-ui;max-width:1100px;margin:auto;padding:20px}}table{{border-collapse:collapse;font-size:13px;margin:8px 0}}td,th{{border:1px solid #ccc;padding:3px 6px}}th{{background:#f1f3f5}}svg{{max-width:100%;height:auto}}</style></head><body>{body}</body></html>')
print(len(body))
