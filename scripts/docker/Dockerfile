FROM node:qtls

# to generate new self-signed cert for testing 
# openssl req -x509 -nodes -days 365 -newkey rsa:2048 -keyout keys/temp.key -out keys/temp.crt

RUN npm install typescript -g

WORKDIR /server

COPY . /server

RUN npm install

RUN tsc -p ./

EXPOSE 4433
CMD [ "npm", "start" ]
