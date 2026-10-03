FROM node:20

WORKDIR /app

RUN apt-get update && apt-get install -y python3 python3-pip && rm -rf /var/lib/apt/lists/*

COPY package*.json ./

RUN npm install

COPY . .

RUN pip3 install --no-cache-dir --break-system-packages \
    pymongo \
    pandas \
    numpy \
    scikit-learn \
    matplotlib \
    prefixspan \
    crontab

CMD ["node", "preprocesamiento.js"]