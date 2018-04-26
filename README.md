# quicker
NodeJS implementation of the QUIC protocol


# setup
```shell
apt-get update && apt-get install -y \
 git \ 
 gcc \ 
 g++ \  
 make \
 python \
 nasm \
 npm
git clone --depth 1 -b add_quicker_support-tls-d28 https://github.com/kevin-kp/node
cd ./node
./configure && make
cd ..
npm install typescript -g && npm install
git clone https://github.com/rmarx/quicker
cd ./quicker
tsc -p ./
// Run Server
./../node/out/Release/node ./out/main.js 127.0.0.1 4433 ./keys/selfsigned_default.key ./keys/selfsigned_default.crt
// Run Client
./../node/out/Release/node ./out/mainclient.js 127.0.0.1 4433
```