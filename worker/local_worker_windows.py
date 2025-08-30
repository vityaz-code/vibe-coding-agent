import os
import time
import json
import requests
import pyautogui
import pyperclip

SERVER = os.environ.get("VIBE_SERVER", "")
TOKEN = os.environ.get("WORKER_TOKEN", "")

def log(*a): print(*a, flush=True)

def poll():
    try:
        r = requests.post(f"{SERVER}/tasks/poll", headers={"X-Worker-Token": TOKEN}, timeout=30)
        j = r.json()
        if j.get("status") == "ok":
            return j["task"]
    except Exception as e:
        log("poll error:", e)
    return None

def submit(task_id, ok, payload=None, error=None):
    body = {"id": task_id, "ok": ok, "payload": payload or {}, "error": error}
    try:
        r = requests.post(f"{SERVER}/tasks/submit", json=body, headers={"X-Worker-Token": TOKEN}, timeout=60)
        return r.json()
    except Exception as e:
        log("submit error:", e)

def bring_chatgpt_to_front():
    for _ in range(3):
        pyautogui.keyDown('alt'); pyautogui.press('tab'); pyautogui.keyUp('alt'); time.sleep(0.5)

def send_prompt_and_copy_answer(prompt: str, wait_sec: int = 20) -> str:
    bring_chatgpt_to_front()
    time.sleep(0.5)
    pyperclip.copy(prompt)
    pyautogui.hotkey('ctrl', 'v')
    time.sleep(0.2)
    pyautogui.press('enter')
    time.sleep(max(5, wait_sec))
    pyautogui.hotkey('ctrl', 'a')
    time.sleep(0.2)
    pyautogui.hotkey('ctrl', 'c')
    time.sleep(0.5)
    return pyperclip.paste()

def extract_json_block(text: str):
    t = text.strip()
    if "```json" in t:
        t = t.split("```json", 1)[1].split("```", 1)[0]
    i, j = t.find("{"), t.rfind("}")
    return json.loads(t[i:j+1])

def main():
    global SERVER, TOKEN
    if not SERVER: SERVER = input("VIBE_SERVER (например https://vibe-coding-agent.onrender.com): ").strip()
    if not TOKEN: TOKEN = input("WORKER_TOKEN (секрет с Render): ").strip()
    log("Worker started. Server:", SERVER)

    while True:
        try:
            task = poll()
            if not task:
                time.sleep(2)
                continue

            kind = task.get("kind")
            prompt = (task.get("payload") or {}).get("prompt", "")
            log("Got task:", task.get("id"), kind)
            if not prompt:
                submit(task.get("id"), False, error="empty prompt")
                continue

            answer = send_prompt_and_copy_answer(prompt, wait_sec=25)
            if kind == "plan":
                try:
                    plan = extract_json_block(answer)
                    payload = {"kind": "plan", "json": plan}
                    submit(task["id"], True, payload=payload)
                    log("Plan submitted.")
                except Exception as e:
                    submit(task["id"], False, error=f"plan parse error: {e}")
            elif kind == "build":
                try:
                    manifest = extract_json_block(answer)
                    payload = {"kind": "build", "manifest": manifest}
                    submit(task["id"], True, payload=payload)
                    log("Build submitted.")
                except Exception as e:
                    submit(task["id"], False, error=f"build parse error: {e}")
            else:
                submit(task["id"], False, error=f"unknown kind: {kind}")

        except KeyboardInterrupt:
            break
        except Exception as e:
            log("Worker error:", e)
            time.sleep(2)

if __name__ == "__main__":
    main()
