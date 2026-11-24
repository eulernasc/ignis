#!/usr/bin/env python3
"""Prepare isolated Spark login. No password changes, no legacy data writes."""
import datetime, hashlib, json, os, re, subprocess, sys, urllib.request, urllib.error, urllib.parse
from pathlib import Path

P = "fueltracker-adee5"
ROOT = f"projects/{P}/databases/(default)/documents"
DB = "https://firestore.googleapis.com/v1/" + ROOT
RULES = "https://firebaserules.googleapis.com/v1/"
RELEASE = f"projects/{P}/releases/cloud.firestore"
ORIGINAL = f"projects/{P}/rulesets/49fd6365-6b38-47e4-8dd4-174f78ef896a"
STAGE = Path(__file__).resolve().with_name("spark-stage.rules").read_text()
token = subprocess.check_output(["gcloud","auth","print-access-token"],text=True).strip()

def request(url, method="GET", payload=None, missing_ok=False):
    req=urllib.request.Request(url,method=method,data=None if payload is None else json.dumps(payload).encode(),
        headers={"Authorization":"Bearer "+token,"x-goog-user-project":P,"Content-Type":"application/json"})
    try:
        with urllib.request.urlopen(req,timeout=40) as r: return json.load(r)
    except urllib.error.HTTPError as e:
        if missing_ok and e.code == 404: return None
        raise RuntimeError(f"HTTP {e.code} em {urllib.parse.urlsplit(url).netloc}; operação {method}.") from None

def val(v):
    if isinstance(v,bool): return {"booleanValue":v}
    if isinstance(v,str): return {"stringValue":v}
    if isinstance(v,list): return {"arrayValue":{"values":[val(x) for x in v]}}
    raise ValueError("Tipo inesperado")

def field(f,k,default=""):
    return f.get(k,{}).get("stringValue",default)

def main():
    release=request(RULES+RELEASE)
    old=request(RULES+release["rulesetName"])
    old_content=old["source"]["files"][0]["content"]
    if release["rulesetName"]!=ORIGINAL and old_content.strip()!=STAGE.strip():
        raise RuntimeError("Regras mudaram desde a auditoria. Nada alterado.")
    cols=request(DB+":listCollectionIds","POST",{}).get("collectionIds",[])
    if not set(cols).issubset({"fueltracker","ignis_profiles","ignis_auth_aliases"}) or "fueltracker" not in cols:
        raise RuntimeError("Coleções inesperadas. Nada alterado.")
    legacy=request(DB+"/fueltracker/usuarios")
    entries=legacy["fields"]["_users"]["mapValue"]["fields"]
    auth=request(f"https://identitytoolkit.googleapis.com/v1/projects/{P}/accounts:batchGet?maxResults=1000")
    users=auth.get("users",[])
    if len(entries)!=14 or len(users)!=14 or auth.get("nextPageToken"):
        raise RuntimeError("Quantidade diferente das 14 contas autorizadas. Nada alterado.")
    writes=[]; matched=set(); master_count=0; alias_count=0
    for name, item in entries.items():
        login=name.strip().lower()
        if login!=name or not login: raise RuntimeError("Login não normalizado. Nada alterado.")
        h=hashlib.sha256(login.encode()).hexdigest()
        options=[u for u in users if u.get("localId","").startswith("ignis_") and
            len(u["localId"][6:])>=12 and h.startswith(u["localId"][6:])]
        if len(options)!=1 or options[0]["localId"] in matched: raise RuntimeError("Vínculo ambíguo. Nada alterado.")
        u=options[0]; uid=u["localId"]; matched.add(uid)
        if u.get("disabled") or not u.get("email"): raise RuntimeError("Conta desativada ou sem e-mail. Nada alterado.")
        f=item["mapValue"]["fields"]
        role=field(f,"role","usuario")
        if role not in {"adm","admin","usuario"}: raise RuntimeError("Papel legado inesperado. Nada alterado.")
        master_count+=int(role=="adm")
        perms=[v["stringValue"] for v in f.get("perms",{}).get("arrayValue",{}).get("values",[]) if "stringValue" in v]
        profile={"login":login,"nome":field(f,"nome",login),"role":role,"perms":perms,"active":True}
        writes.append(("ignis_profiles/"+uid,profile))
        email=u["email"]
        # Publica apenas endereços tecnicos cujo local-part e o hash do login.
        # Email pessoal nunca entra na colecao publica.
        local=email.split("@",1)[0].lower()
        if len(local)>=12 and h.startswith(local):
            writes.append(("ignis_auth_aliases/"+h,{"email":email}))
            alias_count+=1
    if master_count!=1 or len(matched)!=14: raise RuntimeError("Master ou vinculos incorretos. Nada alterado.")
    pending=[]
    for docpath, fields in writes:
        encoded={k:val(v) for k,v in fields.items()}
        current=request(DB+"/"+docpath,missing_ok=True)
        if current:
            if current.get("fields")!=encoded: raise RuntimeError("Perfil existente diverge. Nenhum sobrescrito.")
        else:
            pending.append({"update":{"name":ROOT+"/"+docpath,"fields":encoded},"currentDocument":{"exists":False}})
    backup=Path.home()/("ignis-auth-backup-"+datetime.datetime.now(datetime.timezone.utc).strftime("%Y%m%d-%H%M%S-%f")+".json")
    fd=os.open(backup,os.O_WRONLY|os.O_CREAT|os.O_EXCL,0o600)
    with os.fdopen(fd,"w") as stream:
        json.dump({"release":release,"rules":old,"legacy_users":legacy},stream)
    print("Backup privado criado. Não compartilhe o arquivo.",flush=True)
    if release["rulesetName"]==ORIGINAL:
        candidate=request(RULES+f"projects/{P}/rulesets","POST",{"source":{"files":[{"name":"firestore.rules","content":STAGE}]}})
        fresh=request(RULES+RELEASE)
        if fresh["rulesetName"]!=release["rulesetName"]: raise RuntimeError("Regras mudaram durante preparação. Nada publicado.")
        request(RULES+RELEASE,"PATCH",{"release":{"name":RELEASE,"rulesetName":candidate["name"]},"updateMask":"rulesetName"})
    # Confirma que a fase isolada esta publicada antes de provisionar dados.
    active=request(RULES+RELEASE)
    active_rules=request(RULES+active["rulesetName"])
    if active_rules["source"]["files"][0]["content"].strip()!=STAGE.strip(): raise RuntimeError("Regras de preparação não confirmadas.")
    if pending:
        request(DB+":commit","POST",{"writes":pending})
    for docpath, fields in writes:
        actual=request(DB+"/"+docpath)
        if actual.get("fields")!={k:val(v) for k,v in fields.items()}: raise RuntimeError("Confirmação de perfil falhou.")
    print(json.dumps({"status":"PREPARACAO_CONFIRMADA","profiles":14,"master":1,
        "aliases_tecnicos":alias_count,"contas_com_email_proprio":14-alias_count,
        "senhas_alteradas":0,"contas_recriadas":0,"legacy_preservado":True,
        "firestore_legado_ainda_aberto":True},indent=2,ensure_ascii=False))

try:
    main()
except Exception as e:
    print("INTERROMPIDO:",str(e),file=sys.stderr)
    sys.exit(1)
