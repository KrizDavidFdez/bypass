FROM node:18-bullseye-slim

# 1. Instalar dependencias del sistema PARA PLAYWRIGHT
RUN apt-get update && \
    apt-get install -y \
    wget \
    gnupg \
    ca-certificates \
    fonts-liberation \
    libasound2 \
    libatk-bridge2.0-0 \
    libatk1.0-0 \
    libcups2 \
    libdbus-1-3 \
    libdrm2 \
    libgbm1 \
    libgtk-3-0 \
    libnspr4 \
    libnss3 \
    libxcomposite1 \
    libxdamage1 \
    libxrandr2 \
    xdg-utils \
    libu2f-udev \
    libvulkan1 \
    libxkbcommon0 \
    libxshmfence1 \
    && rm -rf /var/lib/apt/lists/*

# 2. Directorio de trabajo
WORKDIR /app

# 3. Copiar package.json
COPY package*.json ./

# 4. Instalar dependencias de Node INCLUYENDO PLAYWRIGHT
RUN npm ci

# 5. Instalar Chrome para Playwright (IMPORTANTE)
RUN npx playwright install chromium --with-deps

# 6. Copiar el resto del código
COPY . .

# 7. Exponer puerto
EXPOSE 3000

# 8. Comando de inicio
CMD ["node", "server.js"]
