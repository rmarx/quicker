FROM node:qtls

# to generate new self-signed cert for testing 
# openssl req -x509 -nodes -days 365 -newkey rsa:2048 -keyout keys/temp.key -out keys/temp.crt

# COPY ./scripts/ /scripts/

RUN git clone --depth 1 https://github.com/rmarx/quicker.git /server
RUN npm install typescript -g

WORKDIR /server

#COPY run_server.sh /server/
#COPY run_client.sh /server/
#RUN chmod 777 run_server.sh && chmod 777 run_client.sh 
RUN npm install

RUN tsc -p ./

EXPOSE 4433
#CMD [ "node", "/server/out/main.js" ]
#CMD [ "node", "/server/out/main.js", "127.0.0.1", "4433", "./keys/selfsigned_default.key", "./keys/selfsigned_default.crt" ]
CMD [ "tail", "-f", "/dev/null" ]
