FROM node:20

WORKDIR /app

# Primero solo las dependencias, así se reusa la capa si el código cambia pero package.json no
COPY package*.json ./
RUN npm install --omit=dev

COPY . .

CMD ["node", "recomendaciones.js"]