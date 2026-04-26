# -*- coding: utf-8 -*-
"""Insere nó Code entre Download e Whisper; idempotente."""
import json
import uuid
from pathlib import Path

ROOT = Path(__file__).resolve().parent
FLOW = ROOT / "flowAtual.json"
CODE = ROOT / "_whisper_compress_code.js"
NODE_NAME = "Comprimir áudio p/ Whisper (≤25MB)"
DOWNLOAD = "Download Vídeo Viral1"
WHISPER = "OpenAI Whisper — Transcrição"


def apply_to_flow(flow: dict) -> None:
    js = CODE.read_text(encoding="utf-8")
    if '"""' in js:
        raise ValueError("Código não pode conter tripla aspas")

    existing = next((n for n in flow["nodes"] if n["name"] == NODE_NAME), None)
    if not existing:
        nid = str(uuid.uuid4())
        node = {
            "parameters": {"jsCode": js},
            "id": nid,
            "name": NODE_NAME,
            "type": "n8n-nodes-base.code",
            "typeVersion": 2,
            "position": [416, 768],
        }
        idx = next(i for i, n in enumerate(flow["nodes"]) if n["name"] == DOWNLOAD)
        flow["nodes"].insert(idx + 1, node)
    else:
        existing["parameters"]["jsCode"] = js

    con = flow["connections"]
    con[DOWNLOAD] = {"main": [[{"node": NODE_NAME, "type": "main", "index": 0}]]}
    con[NODE_NAME] = {"main": [[{"node": WHISPER, "type": "main", "index": 0}]]}


def main():
    flow = json.loads(FLOW.read_text(encoding="utf-8"))
    apply_to_flow(flow)
    FLOW.write_text(json.dumps(flow, ensure_ascii=False, indent=2), encoding="utf-8")
    print("OK:", FLOW)


if __name__ == "__main__":
    main()
