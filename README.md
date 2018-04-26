# quicker
NodeJS implementation of the QUIC protocol


# setup
```shell
# install dependencies
apt-get update && apt-get install -y       \
                                    git    \ 
                                    gcc    \ 
                                    g++    \  
                                    make   \
                                    python \
                                    nasm   \
                                    npm
# clone custom nodejs with QtlsWrap module
git clone --depth 1 -b add_quicker_support-tls-d28 https://github.com/kevin-kp/node
cd ./node
# build nodejs
./configure && make
cd ..
# install typescript
npm install typescript -g && npm install
# Clone quicker sources
git clone https://github.com/rmarx/quicker
cd ./quicker
# Install quicker dependencies
npm install
tsc -p ./
# Run Server
./../node/out/Release/node ./out/main.js 127.0.0.1 4433 ./keys/selfsigned_default.key ./keys/selfsigned_default.crt
# Run Client
./../node/out/Release/node ./out/mainclient.js 127.0.0.1 4433
```