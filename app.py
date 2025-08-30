import os
import json
import time
import uuid
import zipfile
from pathlib import Path
from typing import Dict, List, Optional
from flask import Flask, request, jsonify, render_template, send_from_directory, session, abort

app = Flask(__name__)
app.secret_key = os.environ.get("APP_SECRET_KEY", "x")

BASE_DIR = Path(os.environ.get("AGENT_DATA_DIR", "/app/generated_codes"))
BASE_DIR.mkdir(parents=True, exist_ok=True)

# --- Simple file helpers ---
def _uid() -> str:
    u = session.get("user_id")
    if not u:
        u = "u_" + uuid.uuid4().hex[:8]
        session["user_id"] = u
    return u

def _udir() -> Path:
    d = BASE_DIR / _uid()
    d.mkdir(parents=True, exist_ok=True)
    (d / "ai").mkdir(exist_ok=True, parents=True)
    (d / "builds").mkdir(exist_ok=True, parents=True)
    (d / "tasks").mkdir(exist_ok=True, parents=True)
    return d

def _f(d: Path, name: str) -> Path:
    p = d / name
    p.parent.mkdir(parents=True, exist_ok=True)
    return p

def _jsonl_append(path: Path, obj: dict):
    with path.open("a", encoding="utf-8") as f:
        f.write(json.dumps(obj, ensure_ascii=False) + "\n")

# --------- Routes: basic ---------
@app.get("/")
def index():
    try:
        return render_template("index.html", now=int(time.time()))
    except Exception:
        return "Vibe Coding Agent is running", 200

@app.get("/download/<user_id>/<path:filename>")
def download(user_id, filename):
    p = BASE_DIR / user_id / filename
    if not p.exists() or not p.is_file():
        abort(404)
    return send_from_directory(p.parent, p.name, as_attachment=True)

@app.get("/healthz")
def healthz():
    return jsonify({"ok": True, "ts": int(time.time())})

# ---------- Prompts sent to ChatGPT UI via worker ----------
PLAN_SYSTEM = """Ты — старший инженер-исследователь. Возьми идею и цели, выдай строго JSON-план:\n
{
  "summary": "...",
  "goals": ["..."],
  "constraints": ["..."],
  "stack": {"frontend":"...", "backend":"...", "db":"...", "infra":"..."},
  "architecture": ["компонент -> задачи", "..."],
  "entities": ["Сущность -> поля", "..."],
  "endpoints": ["METHOD /path: описание", "..."],
  "dir_structure": ["app/", "app/routes.py", "static/", "templates/index.html", ...],
  "tasks": [{"id":"T1","title":"...","steps":["...", "..."]}, ...],
  "risk_notes": ["..."]
}"""

BUILD_SYSTEM = """Ты — Codex-режим. По JSON-плану верни строго JSON-манифест файлов:\n
{
  "files": [
    {"path": "app.py", "content": "<полный код>"},
    {"path": "templates/index.html", "content": "<html>...</html>"},
    ...
  ],
  "notes": ["...", "..."]
}
Правила: генерируй полностью готовые файлы (никаких сокращений, ... или псевдокода), только JSON, пути относительные от корня проекта.
"""

@app.post("/ai/plan")
def ai_plan():
    data = request.get_json(force=True) or {}
    idea = (data.get("idea") or "").strip()
    goals = (data.get("goals") or "").strip()
    constraints = (data.get("constraints") or "").strip()
    if not idea:
        return jsonify({"status":"error","message":"idea is required"}), 400

    prompt = f"""Идея: {idea}\nЦели: {goals or '-'}\nОграничения: {constraints or '-'}\n
    Сформируй план по схеме JSON выше."""
    content = _openai_chat(
        PLAN_MODEL,
        messages=[{"role": "system", "content": PLAN_SYSTEM}, {"role": "user", "content": prompt}],
        temperature=0.2
    )
    try:
        plan = json.loads(content)
    except Exception:
        content_stripped = content.strip().strip("```json").strip("```").strip()
        plan = json.loads(content_stripped)

    plan_path = _save_text("ai/last_plan.json", json.dumps(plan, ensure_ascii=False, indent=2))
    _history_append({"ts": int(time.time()), "type": "ai_plan", "payload": {"idea": idea, "plan_path": str(plan_path)}})
    return jsonify({"status": "ok", "plan": plan})

# Работа с файлами
@app.post("/ai/build")
def ai_build():
    data = request.get_json(force=True) or {}
    plan = data.get("plan")
    if not plan:
        p = _udir() / "ai/last_plan.json"
        if not p.exists():
            return jsonify({"status":"error","message":"plan is required or run /ai/plan first"}), 400
        plan = json.loads(p.read_text(encoding="utf-8"))

    build_prompt = "Сгенерируй полностью готовый проект по плану (строго JSON формата выше). План:\n" + json.dumps(plan, ensure_ascii=False, indent=2)
    content = _openai_chat(
        CODE_MODEL,
        messages=[{"role": "system", "content": BUILD_SYSTEM}, {"role": "user", "content": build_prompt}],
        temperature=0.15
    )

    try:
        manifest = json.loads(content)
    except Exception:
        manifest = json.loads(content.strip().strip("```json").strip("```").strip())

    files = manifest.get("files") or []
    notes = manifest.get("notes") or []

    build_id = "build_" + uuid.uuid4().hex[:8]
    out_dir = _udir() / "builds" / build_id
    out_dir.mkdir(parents=True, exist_ok=True)
    written = _write_files_from_manifest(out_dir, files)

    zip_path = _udir() / f"{build_id}.zip"
    with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as z:
        for rel in written:
            z.write(out_dir / rel, arcname=rel)

    _history_append({"ts": int(time.time()), "type": "ai_build", "payload": {"build_id": build_id, "files": written}})
    return jsonify({
        "status": "ok",
        "build_id": build_id,
        "files_count": len(written),
        "notes": notes,
        "download_url": f"/download/{_user_id()}/{build_id}.zip"
    })
