# Imagen base: Node.js versión 20
FROM node:20

# Carpeta de trabajo dentro del contenedor
WORKDIR /app

# Copio primero solo los archivos de dependencias
COPY package*.json ./

# Instalo las dependencias (express, cors, etc.)
RUN npm install

# Recién ahora copio el resto del código
COPY . .

# Comando que se ejecuta al arrancar el contenedor
CMD ["node", "preprocesamiento.js"]