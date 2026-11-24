#!/usr/bin/env python3
"""IGNIS: prepara corte autenticado, sem modificar as senhas dos 14 usuários.
Uso: python3 spark-cutover.py --apply
Modo manual: --apply --manual-report usa senha técnica em arquivo privado, já cadastrada nos Secrets pelo proprietário.
"""
import os, sys, json, subprocess, urllib.request, urllib.error, urllib.parse, hashlib, secrets, datetime
from pathlib import Path

P="fueltracker-adee5"
REPO="eulernasc/ignis"
ROOT=f"projects/{P}/databases/(default)/documents"
DB="https://firestore.googleapis.com/v1/"+ROOT
RULES="https://firebaserules.googleapis.com/v1/"
REL=f"projects/{P}/releases/cloud.firestore"
AUTH=f"https://identitytoolkit.googleapis.com/v1/projects/{P}"
APP="1:488178201286:web:ecde03cc0488f4c3ffddc7"
HERE=Path(__file__).resolve().parent
FINAL=(HERE/"spark-final.rules").read_text()
STAGE=(HERE/"spark-stage.rules").read_text()
REPORT_UID="ignis_report_reader"
REPORT_EMAIL="ignis-report-reader@ignis.invalid"
APPLY="--apply" in sys.argv
MANUAL="--manual-report" in sys.argv
PASSWORD_FILE=Path.home()/".ignis-report-password"
TOKEN=subprocess.check_output(["gcloud","auth","print-access-token"],text=True).strip()
headers={"Authorization":"Bearer "+TOKEN,"x-goog-user-project":P,"Content-Type":"application/json"}
def req(url,method="GET",data=None,missing=False,h=None):
    r=urllib.request.Request(url,method=method,data=None if data is None else json.dumps(data).encode(),headers=headers if h is None else h)
    try:
        with urllib.request.urlopen(r,timeout=60) as f:return json.load(f)
    except urllib.error.HTTPError as e:
        if missing and e.code==404:return None
        try: message=json.loads(e.read()).get("error",{}).get("status","")
        except Exception: message=""
        raise RuntimeError(f"{method} {urllib.parse.urlsplit(url).netloc}: HTTP {e.code} {message}") from None
def field(v):
    if "stringValue" in v:return v["stringValue"]
    if "booleanValue" in v:return v["booleanValue"]
    if "integerValue" in v:return int(v["integerValue"])
    if "doubleValue" in v:return v["doubleValue"]
    if "nullValue" in v:return None
    if "timestampValue" in v:return v["timestampValue"]
    if "arrayValue" in v:return [field(x) for x in v["arrayValue"].get("values",[])]
    if "mapValue" in v:return {k:field(x) for k,x in v["mapValue"].get("fields",{}).items()}
    raise RuntimeError("Tipo de campo inesperado.")
def decode(d):return {k:field(v) for k,v in d.get("fields",{}).items()}
def enc(v):
    if v is None:return {"nullValue":None}
    if isinstance(v,bool):return {"booleanValue":v}
    if isinstance(v,str):return {"stringValue":v}
    if isinstance(v,int):return {"integerValue":str(v)}
    if isinstance(v,float):return {"doubleValue":v}
    if isinstance(v,list):return {"arrayValue":{"values":[enc(x) for x in v]}}
    if isinstance(v,dict):return {"mapValue":{"fields":{k:enc(x) for k,x in v.items()}}}
    raise RuntimeError("Tipo inesperado.")
def doc(path):return req(DB+"/"+path,missing=True)
def listdocs(col,mask=()):
    out=[];page=""
    while True:
        params=[("pageSize","300")]+[("mask.fieldPaths",x) for x in mask]
        if page:params.append(("pageToken",page))
        d=req(DB+"/"+col+"?"+urllib.parse.urlencode(params));out+=d.get("documents",[])
        page=d.get("nextPageToken","")
        if not page:return out
def write(path,values,existing=None,mask=None):
    w={"update":{"name":ROOT+"/"+path,"fields":values},"currentDocument":{"updateTime":existing["updateTime"]} if existing else {"exists":False}}
    if mask is not None:w["updateMask"]={"fieldPaths":mask}
    return w
def commit(writes):
    if writes:req(DB+":commit","POST",{"writes":writes})
def rules_source(content):return {"source":{"files":[{"name":"firestore.rules","content":content}]}}
def compile_rules(content):
    tested=req(RULES+f"projects/{P}:test","POST",{**rules_source(content),"testSuite":{"testCases":[]}})
    errors=[x for x in tested.get("issues",[]) if x.get("severity")=="ERROR"]
    if errors:
        for e in errors:print("Erro de compilação:",e.get("description","")[:400])
        raise RuntimeError("Regras não compiladas. Nenhuma regra publicada.")
    return req(RULES+f"projects/{P}/rulesets","POST",rules_source(content))["name"]
def source_for(release):return req(RULES+release["rulesetName"])["source"]["files"][0]["content"].strip()
def publish(name,expected):
    if req(RULES+REL)["rulesetName"]!=expected:raise RuntimeError("As regras mudaram durante o processo.")
    req(RULES+REL,"PATCH",{"release":{"name":REL,"rulesetName":name},"updateMask":"rulesetName"})
    if req(RULES+REL)["rulesetName"]!=name:raise RuntimeError("Publicação de regras não confirmada.")
def private_json(path,data):
    fd=os.open(path,os.O_WRONLY|os.O_CREAT|os.O_EXCL,0o600)
    with os.fdopen(fd,"w") as f:json.dump(data,f,ensure_ascii=False)
def ghsecret(name,value):
    subprocess.run(["gh","secret","set",name,"--repo",REPO],input=value,text=True,check=True,stdout=subprocess.DEVNULL)
def main():
    release=req(RULES+REL)
    if source_for(release)!=STAGE.strip():raise RuntimeError("A fase de preparação não corresponde à versão esperada. Nenhuma regra alterada.")
    profiles=listdocs("ignis_profiles")
    people={d["name"].rsplit("/",1)[-1]:decode(d) for d in profiles}
    legacy=doc("fueltracker/usuarios")
    if not legacy:raise RuntimeError("Cadastro legado não localizado.")
    old=decode(legacy)["_users"]
    humans={uid:v for uid,v in people.items() if v.get("role") in ("adm","admin","usuario")}
    if len(humans)!=14 or len(old)!=14 or sum(v["role"]=="adm" for v in humans.values())!=1:raise RuntimeError("Contagem de perfis não confere.")
    for uid,v in humans.items():
        if v.get("active") is not True or v["login"] not in old or not hashlib.sha256(v["login"].encode()).hexdigest().startswith(uid.removeprefix("ignis_")):raise RuntimeError("Vínculo de perfil divergente.")
        previous=old[v["login"]]
        if v["role"]!=previous.get("role","usuario") or v["perms"]!=previous.get("perms",[]):raise RuntimeError("Permissões divergentes; não aplicar corte.")
    accounts=req(AUTH+"/accounts:batchGet?maxResults=1000")
    users={u["localId"]:u for u in accounts.get("users",[])}
    if accounts.get("nextPageToken") or any(uid not in users or users[uid].get("disabled") for uid in humans):raise RuntimeError("Contas não confirmadas.")
    if set(users)-set(humans)-{REPORT_UID}:raise RuntimeError("Contas inesperadas.")
    main_doc=doc("fueltracker/dados_v4")
    if not main_doc or field(main_doc.get("fields",{}).get("_storageVersion",{"integerValue":"0"}))!=4:raise RuntimeError("Manifesto v4 ausente.")
    if doc("ignis_security/config") or listdocs("ignis_cases"):raise RuntimeError("Migração de ocorrências já existente; não sobrescrever.")
    site=urllib.request.urlopen("https://eulernasc.github.io/ignis/index.html?cutover="+str(datetime.datetime.now().timestamp()),timeout=40).read().decode()
    if "2026-11-24-firebase-auth-spark" not in site or "await auth.login(login,password,email)" not in site:raise RuntimeError("GitHub Pages ainda não está com a versão segura. Nenhuma regra alterada.")
    print("PRÉ-VALIDAÇÃO: 14 contas, permissões, manifesto v4 e site seguro confirmados.",flush=True)
    # Verifica GitHub antes de qualquer mutação para preservar relatório mensal.
    if MANUAL:
        if not PASSWORD_FILE.is_file() or PASSWORD_FILE.stat().st_mode & 0o077:
            raise RuntimeError("Arquivo privado ~/.ignis-report-password ausente ou inseguro.")
        manual_password=PASSWORD_FILE.read_text().strip()
        if len(manual_password)<32:raise RuntimeError("Senha técnica inválida.")
    else:
        if subprocess.run(["gh","auth","status"],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL).returncode:
            raise RuntimeError("GitHub CLI não autenticado. Use a opção manual.")
        subprocess.run(["gh","repo","view",REPO,"--json","viewerPermission"],check=True,stdout=subprocess.DEVNULL)
    if not APPLY:
        print("Somente validação. Use --apply para executar o corte.")
        return
    # Compila ambas as regras antes de mudar o banco. Bloqueio temporário impede
    # clientes antigos de reescrever a ocorrência durante a migração.
    freeze=STAGE.replace("allow read, write: if true;","allow read, write: if false;")
    if freeze==STAGE:raise RuntimeError("Não foi possível preparar manutenção.")
    final_name=compile_rules(FINAL)
    freeze_name=compile_rules(freeze)
    print("Regras de manutenção e definitivas compiladas.",flush=True)
    # A conta técnica não é uma das 14 pessoas. Nenhuma senha humana é redefinida.
    if REPORT_UID in users or REPORT_UID in people:raise RuntimeError("Conta técnica já existente; não redefinir sua senha automaticamente.")
    password=manual_password if MANUAL else secrets.token_urlsafe(40)
    backup=Path.home()/("ignis-cutover-"+datetime.datetime.now(datetime.timezone.utc).strftime("%Y%m%d-%H%M%S-%f")+".json")
    private_json(backup,{"release":release,"legacy_users":legacy,"manifest":main_doc,"profiles":profiles})
    # Não imprimir senha, token ou e-mail pessoal. Secrets enviados via stdin.
    if not MANUAL:
        ghsecret("IGNIS_REPORT_EMAIL",REPORT_EMAIL)
        ghsecret("IGNIS_REPORT_PASSWORD",password)
    config=req(f"https://firebase.googleapis.com/v1beta1/projects/{P}/webApps/{APP}/config")
    key=config["apiKey"]
    if not MANUAL:
        ghsecret("FIREBASE_API_KEY",key)
        ghsecret("FIREBASE_PROJECT_ID",P)
    req(AUTH+"/accounts","POST",{"localId":REPORT_UID,"email":REPORT_EMAIL,"password":password,"emailVerified":False})
    report_profile={"login":"relatorio_tecnico","nome":"Relatório automático","role":"report","perms":[],"active":True}
    commit([write("ignis_profiles/"+REPORT_UID,{k:enc(v) for k,v in report_profile.items()})])
    result=req("https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key="+urllib.parse.quote(key),"POST",{"email":REPORT_EMAIL,"password":password,"returnSecureToken":True},h={"Content-Type":"application/json"})
    if result.get("localId")!=REPORT_UID or not result.get("idToken"):raise RuntimeError("Conta técnica não confirmada.")
    report_token=result["idToken"]
    print("Conta técnica do relatório criada e autenticada.",flush=True)
    publish(freeze_name,release["rulesetName"])
    print("Manutenção temporária ativada. Migrando registros.",flush=True)
    # Releitura após bloqueio; backup específico contém o estado imediatamente anterior.
    current=doc("fueltracker/dados_v4")
    live_legacy=doc("fueltracker/usuarios")
    if decode(live_legacy)!=decode(legacy):raise RuntimeError("Cadastro mudou durante preparação. Banco em manutenção; não reabrir publicamente.")
    conf=current["fields"].get("planejamento2027",{}).get("mapValue",{}).get("fields",{})
    raw_cases=conf.get("tratativas",{}).get("arrayValue",{}).get("values",[])
    excluded=field(conf.get("excluidas",{"mapValue":{}}))
    writes=[];ids=set();now=datetime.datetime.now(datetime.timezone.utc).isoformat().replace("+00:00","Z")
    for raw in raw_cases:
        case=field(raw);cid=case.get("id")
        if not isinstance(cid,str) or not cid or cid in ids:raise RuntimeError("Identificador de ocorrência inválido ou duplicado.")
        ids.add(cid)
        owner=""
        author=case.get("criadoPorUid") or case.get("createdByUid")
        if author in humans:owner=author
        if not owner:
            history=case.get("historico") or []
            first=next((x for x in history if x.get("tipo")=="Abertura da ocorrência"),{})
            name=str(first.get("autor") or case.get("criadoPor") or "").strip().casefold()
            matched=[uid for uid,v in humans.items() if name and name in (v["login"].casefold(),v["nome"].casefold())]
            if len(matched)==1:owner=matched[0]
        # Sem prova de autor, apenas o master/editor delegado pode editar.
        payload={"record":raw,"createdByUid":enc(owner),"updatedByUid":enc("migration"),"version":enc(1),"deleted":enc(cid in excluded),"updatedAt":{"timestampValue":now}}
        writes.append(write("ignis_cases/"+hashlib.sha256(cid.encode()).hexdigest(),payload))
    # Preserve tombstones de registros que já haviam sido excluídos.
    for cid in excluded:
        if cid in ids:continue
        if not isinstance(cid,str) or not cid:raise RuntimeError("Tombstone inválido.")
        payload={"record":enc({"id":cid,"historico":[]}),"createdByUid":enc(""),"updatedByUid":enc("migration"),"version":enc(1),"deleted":enc(True),"updatedAt":{"timestampValue":now}}
        writes.append(write("ignis_cases/"+hashlib.sha256(cid.encode()).hexdigest(),payload))
    expected_count=len(ids|set(excluded))
    # Remove hashes e cópias de ocorrências dos documentos compartilhados.
    candidates=listdocs("fueltracker",("_users","planejamento2027"))
    full=[]
    for d in candidates:
        name=d["name"].rsplit("/",1)[-1]
        if name=="usuarios":continue
        fields=d.get("fields",{})
        pfields=fields.get("planejamento2027",{}).get("mapValue",{}).get("fields",{})
        masks=[]
        if "_users" in fields:masks.append("_users")
        for k in ("tratativas","excluidas"):
            if k in pfields:masks.append("planejamento2027."+k)
        if not masks:continue
        actual=doc("fueltracker/"+name)
        full.append(actual)
        writes.append(write("fueltracker/"+name,{},actual,masks))
    archive=Path.home()/("ignis-legacy-private-"+datetime.datetime.now(datetime.timezone.utc).strftime("%Y%m%d-%H%M%S-%f")+".json")
    private_json(archive,{"legacy_users":live_legacy,"changed_documents":full,"legacy_cases":raw_cases,"legacy_tombstones":excluded})
    writes.append({"delete":ROOT+"/fueltracker/usuarios","currentDocument":{"updateTime":live_legacy["updateTime"]}})
    writes.append(write("ignis_security/config",{"casesReady":enc(True),"migratedAt":{"timestampValue":now},"caseCount":enc(len(raw_cases))}))
    if len(writes)>450:raise RuntimeError("Migração excede limite atômico. Banco em manutenção.")
    commit(writes)
    if doc("fueltracker/usuarios") or len(listdocs("ignis_cases"))!=expected_count:raise RuntimeError("Verificação de migração falhou.")
    publish(final_name,freeze_name)
    # Testes REST reais: anônimo negado; leitor técnico autorizado; escrita negada.
    public={"Content-Type":"application/json"}
    reader={"Authorization":"Bearer "+report_token,"Content-Type":"application/json"}
    def denied(url,h):
        try:req(url,h=h)
        except RuntimeError as e:return "HTTP 403" in str(e) or "HTTP 401" in str(e)
        return False
    if not denied(DB+"/fueltracker/dados_v4",public):raise RuntimeError("Leitura anônima não foi negada.")
    req(DB+"/fueltracker/dados_v4",h=reader)
    if not denied(DB+"/ignis_profiles/"+next(uid for uid,v in humans.items() if v["role"]=="adm"),reader):raise RuntimeError("Leitor técnico acessa perfil indevido.")
    probe=DB+"/fueltracker/security_report_write_probe_"+secrets.token_hex(8)
    try:
        req(probe+"?currentDocument.exists=false","PATCH",{"fields":{"probe":enc(True)}},h=reader)
    except RuntimeError as e:
        if "HTTP 403" not in str(e) and "HTTP 401" not in str(e):raise
    else:
        req(probe,"DELETE")
        raise RuntimeError("Leitor técnico conseguiu gravar indevidamente.")
    print(json.dumps({"status":"CORTE_CONFIRMADO","contas_humanas_preservadas":14,"senhas_humanas_alteradas":0,"ocorrencias_migradas":len(raw_cases),"backup_privado":True,"acesso_anonimo_bloqueado":True,"relatorio_leitura_confirmada":True,"regras":final_name},ensure_ascii=False,indent=2))
try:main()
except Exception as e:
    print("INTERROMPIDO:",str(e),file=sys.stderr)
    sys.exit(1)
