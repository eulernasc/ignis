#!/usr/bin/env python3
"""IGNIS production audit. Read-only. Prints no passwords, hashes, email addresses or tokens."""
import json
import subprocess
import urllib.request
import urllib.parse
import urllib.error
import sys

PROJECT = "fueltracker-adee5"
try:
    token = subprocess.check_output(["gcloud", "auth", "print-access-token"], text=True, stderr=subprocess.DEVNULL).strip()
except (OSError, subprocess.CalledProcessError):
    sys.exit("ERRO: autentique sua conta Google no Cloud Shell e tente novamente.")
if not token:
    sys.exit("ERRO: nao foi possivel autenticar.")
report = {"project": PROJECT, "mode": "READ_ONLY", "errors": {}}

def get(url, label, params=None):
    if params:
        url += "?" + urllib.parse.urlencode(params, doseq=True)
    req = urllib.request.Request(url, headers={"Authorization": "Bearer " + token, "Accept": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=35) as response:
            return json.load(response)
    except urllib.error.HTTPError as exc:
        report["errors"][label] = {"http": exc.code}
    except (urllib.error.URLError, TimeoutError, ValueError) as exc:
        report["errors"][label] = {"error": type(exc).__name__}
    return None

base = "https://firestore.googleapis.com/v1/projects/" + PROJECT + "/databases/(default)/documents/"
doc = get(base + "fueltracker/usuarios", "legacy_users", {"mask.fieldPaths": "_users"})
if doc is not None:
    entries = doc.get("fields", {}).get("_users", {}).get("mapValue", {}).get("fields", {})
    import re
    accounts = [x.get("mapValue", {}).get("fields", {}) for x in entries.values()]
    report["legacy_users"] = {
        "count": len(accounts),
        "sha256_count": sum(bool(re.fullmatch("[0-9a-fA-F]{64}", a.get("hash", {}).get("stringValue", ""))) for a in accounts),
        "master_count": sum(a.get("role", {}).get("stringValue") == "adm" for a in accounts),
        "other_admin_count": sum(a.get("role", {}).get("stringValue") == "admin" for a in accounts)
    }

doc = get(base + "fueltracker/dados_v4", "legacy_occurrences", {"mask.fieldPaths": "planejamento2027.tratativas"})
if doc is not None:
    p = doc.get("fields", {}).get("planejamento2027", {}).get("mapValue", {}).get("fields", {})
    if "tratativas" in p:
        arr = p["tratativas"].get("arrayValue", {}).get("values", [])
        report["legacy_occurrences"] = {"count": len(arr), "field_present": True}
    else:
        report["legacy_occurrences"] = {"field_present": False}

config = get("https://identitytoolkit.googleapis.com/admin/v2/projects/" + PROJECT + "/config", "auth_config")
if config is not None:
    signin = config.get("signIn", {})
    report["auth_config"] = {
        "email_password_enabled": bool(signin.get("email", {}).get("enabled")) and bool(signin.get("email", {}).get("passwordRequired")),
        "email_enabled": bool(signin.get("email", {}).get("enabled")),
        "anonymous_enabled": bool(signin.get("anonymous", {}).get("enabled"))
    }

counts = {"total": 0, "with_password": 0, "with_email": 0, "without_email": 0, "disabled": 0, "complete": False}
next_page = ""
for i in range(10):
    params = {"maxResults": 1000}
    if next_page:
        params["nextPageToken"] = next_page
    users = get("https://identitytoolkit.googleapis.com/v1/projects/" + PROJECT + "/accounts:batchGet", "auth_users", params)
    if users is None:
        break
    for u in users.get("users", []):
        counts["total"] += 1
        counts["with_email"] += int(bool(u.get("email")))
        counts["without_email"] += int(not u.get("email"))
        counts["disabled"] += int(bool(u.get("disabled")))
        counts["with_password"] += int(any(p.get("providerId") == "password" for p in u.get("providerUserInfo", [])) or bool(u.get("passwordUpdatedAt")))
    next_page = users.get("nextPageToken", "")
    if not next_page:
        counts["complete"] = True
        break
report["auth_users"] = counts

billing = get("https://cloudbilling.googleapis.com/v1/projects/" + PROJECT + "/billingInfo", "billing")
if billing is not None:
    report["billing_enabled"] = billing.get("billingEnabled")

release = get("https://firebaserules.googleapis.com/v1/projects/" + PROJECT + "/releases/cloud.firestore", "firestore_release")
if release is not None and release.get("rulesetName"):
    ruleset = get("https://firebaserules.googleapis.com/v1/" + release["rulesetName"], "firestore_ruleset")
    if ruleset is not None:
        report["firestore_rules"] = {
            "ruleset": release["rulesetName"],
            "updated": release.get("updateTime"),
            "files": [{"name": x.get("name"), "content": x.get("content")} for x in ruleset.get("source", {}).get("files", [])]
        }
print(json.dumps(report, ensure_ascii=False, indent=2))
