FROM node:qtls

RUN npm install typescript -g

WORKDIR /server

COPY . /server

RUN npm install

RUN tsc -p ./

EXPOSE 4433
CMD [ "npm", "start" ]
