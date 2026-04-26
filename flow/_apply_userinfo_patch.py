# -*- coding: utf-8 -*-
"""Atualiza _patch_flow.py: NORMALIZAR + helpers + chamadas."""
import uuid
from pathlib import Path

root = Path(__file__).resolve().parent
patch_py = root / "_patch_flow.py"
normal_js = (root / "_normalizar_perfil_userinfo.js").read_text(encoding="utf-8")
if '"""' in normal_js:
    raise ValueError("normalizar JS não pode conter tripla aspas")

text = patch_py.read_text(encoding="utf-8")
start = text.index('NORMALIZAR = r"""')
end = text.index('\nSEPARAR = r"""', start)
new_block = 'NORMALIZAR = r"""' + normal_js + '\n"""\n'
text = text[:start] + new_block + text[end + 1 :]

inject = r'''

def ensure_userinfo_instagram_node(flow):
    USERINFO = "RapidAPI — UserInfo Instagram"
    POSTS = "RapidAPI — Buscar Perfil Instagram"
    names = {n["name"] for n in flow["nodes"]}
    if USERINFO not in names:
        node = {
            "parameters": {
                "method": "POST",
                "url": "https://instagram120.p.rapidapi.com/api/instagram/userInfo",
                "sendHeaders": True,
                "headerParameters": {
                    "parameters": [
                        {"name": "X-Rapidapi-Key", "value": "={{ $env.RAPIDAPI_KEY || '0127634a29msh4a303edef58f6dbp1430c6jsnd00af7a6bc1e' }}"},
                        {"name": "X-Rapidapi-Host", "value": "instagram120.p.rapidapi.com"},
                        {"name": "Content-Type", "value": "application/json"},
                    ]
                },
                "sendBody": True,
                "specifyBody": "json",
                "jsonBody": "={{ JSON.stringify({ username: String($json.handle || '').replace(/^@/, '').trim() }) }}",
                "options": {
                    "timeout": 45000,
                    "batching": {"batch": {"batchSize": 1, "batchInterval": 750}},
                },
            },
            "id": str(uuid.uuid4()),
            "name": USERINFO,
            "type": "n8n-nodes-base.httpRequest",
            "typeVersion": 4.2,
            "position": [-2392, 976],
        }
        nodes_list = flow["nodes"]
        idx = next(i for i, n in enumerate(nodes_list) if n["name"] == "Expandir Handles")
        nodes_list.insert(idx + 1, node)
    con = flow["connections"]
    con["Expandir Handles"] = {"main": [[{"node": USERINFO, "type": "main", "index": 0}]]}
    con[USERINFO] = {"main": [[{"node": POSTS, "type": "main", "index": 0}]]}


def enrich_montar_payload_perfil(nodes_dict):
    old_cli = (
        "cliente_resumo = {\n"
        "  nome:              base.nome_cliente,\n"
        "  nicho:             base.nicho,\n"
        "  handle:            `@${base.handle_cliente}`,\n"
        "  bio:               c.bio               || '',\n"
        "  seguidores:        c.seguidores         || 0,"
    )
    new_cli = (
        "cliente_resumo = {\n"
        "  nome:              base.nome_cliente,\n"
        "  nicho:             base.nicho,\n"
        "  handle:            `@${base.handle_cliente}`,\n"
        "  nome_exibicao:     c.full_name || c.page_name || '',\n"
        "  page_name:         c.page_name || '',\n"
        "  bio:               c.bio               || '',\n"
        "  link_bio:          c.link_externo || '',\n"
        "  bio_links:         c.bio_links || [],\n"
        "  is_private:        !!c.is_private,\n"
        "  is_business_perfil: !!c.is_business,\n"
        "  profile_pic_url:   c.profile_pic_url || '',\n"
        "  contatos_publicos: c.contatos_publicos || {},\n"
        "  seguidores:        c.seguidores         || 0,"
    )
    old_conc = (
        "const concorrentes_resumo = (base.concorrentes_dados || []).map(cc => ({\n"
        "  handle:           `@${cc.handle}`,\n"
        "  bio:              cc.bio,\n"
        "  seguidores:       cc.seguidores,"
    )
    new_conc = (
        "const concorrentes_resumo = (base.concorrentes_dados || []).map(cc => ({\n"
        "  handle:           `@${cc.handle}`,\n"
        "  nome_exibicao:    cc.full_name || cc.page_name || '',\n"
        "  page_name:        cc.page_name || '',\n"
        "  bio:              cc.bio,\n"
        "  link_bio:         cc.link_externo || '',\n"
        "  bio_links:        cc.bio_links || [],\n"
        "  is_private:       !!cc.is_private,\n"
        "  is_business_perfil: !!cc.is_business,\n"
        "  seguidores:       cc.seguidores,"
    )
    for name in ("Montar Payload GPT-4o", "Montar Payload GPT-4o (sem vídeos)"):
        js = nodes_dict[name]["parameters"]["jsCode"]
        if old_cli in js:
            js = js.replace(old_cli, new_cli)
        if old_conc in js:
            js = js.replace(old_conc, new_conc)
        nodes_dict[name]["parameters"]["jsCode"] = js
'''

marker = 'path.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")'
if "def ensure_userinfo_instagram_node" not in text:
    text = text.replace(
        marker,
        "ensure_userinfo_instagram_node(data)\n"
        "enrich_montar_payload_perfil(nodes)\n\n" + marker,
    )
    anchor = 'nodes["Normalizar Perfil"]["parameters"]["jsCode"] = NORMALIZAR'
    text = text.replace(anchor, inject.strip() + "\n\n" + anchor)

if "import uuid" not in text:
    text = text.replace("import json\n", "import json\nimport uuid\n", 1)

patch_py.write_text(text, encoding="utf-8")
print("OK _patch_flow.py atualizado")
