import os
import subprocess
import requests
import time

# === Настройки ===
GITHUB_REPO_PATH = "/path/to/vibe-coding-agent"  # путь к локальному репо
GITHUB_BRANCH = "main"
RENDER_API_KEY = os.environ.get("RENDER_API_KEY")  # токен Render
RENDER_SERVICE_ID = "<твоя Service ID на Render>"

# Telegram
TELEGRAM_TOKEN = os.environ.get("TELEGRAM_TOKEN")  # токен бота
TELEGRAM_CHAT_ID = os.environ.get("TELEGRAM_CHAT_ID")  # id чата

DEPLOY_URL = f"https://api.render.com/v1/services/{RENDER_SERVICE_ID}/deploys"
HEADERS = {"Authorization": f"Bearer {RENDER_API_KEY}", "Accept": "application/json", "Content-Type": "application/json"}

# Отправка уведомлений в Telegram
def send_telegram_message(text):
    if TELEGRAM_TOKEN and TELEGRAM_CHAT_ID:
        url = f"https://api.telegram.org/bot{TELEGRAM_TOKEN}/sendMessage"
        data = {"chat_id": TELEGRAM_CHAT_ID, "text": text}
        try:
            requests.post(url, data=data)
        except Exception as e:
            print("Telegram notification failed:", e)

# --- Git commit + push ---
def git_commit_push(message="Auto deploy"):
    os.chdir(GITHUB_REPO_PATH)
    try:
        subprocess.run(["git", "add", "."], check=True)
        subprocess.run(["git", "commit", "-m", message], check=True)
        subprocess.run(["git", "push", "origin", GITHUB_BRANCH], check=True)
        print("[Git] Коммит и пуш выполнены успешно.")
    except subprocess.CalledProcessError as e:
        print("[Git] Ошибка при коммите/пуше:", e)

# --- Trigger deploy на Render ---
def trigger_render_deploy():
    payload = {"clearCache": True}
    r = requests.post(DEPLOY_URL, headers=HEADERS, json=payload)
    if r.status_code == 201:
        deploy_id = r.json()["id"]
        print(f"[Render] Деплой запущен. ID: {deploy_id}")
        return deploy_id
    else:
        print(f"[Render] Ошибка триггера деплоя: {r.status_code} {r.text}")
        send_telegram_message(f"Ошибка деплоя Render: {r.text}")
        return None

# --- Проверка статуса деплоя ---
def wait_for_deploy(deploy_id, timeout=900):
    start = time.time()
    while time.time() - start < timeout:
        r = requests.get(f"{DEPLOY_URL}/{deploy_id}", headers=HEADERS)
        if r.status_code == 200:
            status = r.json()["status"]
            print(f"[Render] Статус деплоя: {status}")
            if status in ["live", "failed"]:
                return status
        time.sleep(5)
    return "timeout"

# --- Основной запуск ---
if __name__ == "__main__":
    print("=== Автоматический деплой Vibe Coding Agent с Telegram уведомлением ===")
    git_commit_push("Auto update for deploy")
    deploy_id = trigger_render_deploy()
    if deploy_id:
        status = wait_for_deploy(deploy_id)
        if status == "live":
            link = f"https://{RENDER_SERVICE_ID}.onrender.com"
            print(f"[Render] Деплой успешен: {link}")
            send_telegram_message(f"Деплой успешен! Сервис доступен по ссылке: {link}")
        else:
            print(f"[Render] Деплой завершился со статусом: {status}")
            send_telegram_message(f"Деплой завершился со статусом: {status}, проверь логи Render")
