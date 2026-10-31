import json
def load(p):
    t=open(p).read()
    try: t=json.loads(t)['result']
    except Exception: pass
    s=t.find('[{"'); e=t.rfind('</untrusted')
    x=json.loads(t[s:e].strip())
    v=list(x[0].values())[0]
    return v
