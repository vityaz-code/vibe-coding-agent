FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    DEBIAN_FRONTEND=noninteractive

WORKDIR /app

# Системные зависимости
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates curl wget unzip xz-utils gnupg git npm \
    xvfb xdg-utils \
    fonts-liberation libxss1 libappindicator3-1 libasound2 \
    libatk-bridge2.0-0 libgtk-3-0 libnss3 libx11-xcb1 \
    chromium chromium-driver \
 && rm -rf /var/lib/apt/lists/*

ENV CHROME_BIN=/usr/bin/chromium \
    CHROMEDRIVER_BIN=/usr/bin/chromedriver

# Python dependencies
COPY requirements.txt .
RUN pip install --upgrade pip setuptools wheel \
    && pip install --no-cache-dir -r requirements.txt

# Node-based CLIs
RUN npm i -g @railway/cli \
    && npm cache clean --force

# Flyctl
RUN curl -L https://fly.io/install.sh | sh \
    && mv /root/.fly/bin/flyctl /usr/local/bin/flyctl \
    && chmod +x /usr/local/bin/flyctl

# Копируем код приложения
COPY . .

EXPOSE 8080

CMD gunicorn -w 1 -k gthread --threads 4 -b 0.0.0.0:$PORT app:app --timeout 120
