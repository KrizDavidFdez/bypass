FROM node:18-slim

# Instalar dependencias del sistema para Playwright
RUN apt-get update && apt-get install -y \
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
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copiar package.json primero para caché de dependencias
COPY package*.json ./

# Instalar dependencias de Node
RUN npm ci --only=production

# Instalar Playwright y sus browsers
RUN npx playwright install-deps chromium
RUN npx playwright install chromium

# Copiar el resto de la aplicación
COPY . .

EXPOSE 3000

CMD ["node", "server.js"]
