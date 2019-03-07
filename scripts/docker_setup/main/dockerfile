FROM ubuntu:16.04
MAINTAINER Robin Marx <robin.marx@uhasselt.be>

# install necessary packages
RUN 						\
	apt-get update 			\
	&& apt-get upgrade -y 	\
	&& apt-get install -y 	\
    	build-essential 	\
		gcc 				\
		make 				\
		python-pip 			\
		python2.7 			\
		nasm 				\
		git 				\
    && apt-get autoremove 	\
    && apt-get clean		\
	&& rm -rf /var/lib/apt/lists/*

RUN git clone --depth 1 -b add_quicker_support-draft-15 https://github.com/rmarx/node.git /node


############################################
## run only when you have to upgrade openssl (e.g., from a new version from tatsuhiro)
## mainly included here so we remember to do this manually, not really intended this is done on build of docker image 
## we do this once manually and commit the result to the repo, which the previous git clone pulled in 
## START upgrade
# WORKDIR /node
# git clone --depth 1 -b quic-draft-15 https://github.com/tatsuhiro-t/openssl /node/deps/openssl/ # this overwrites the old openSSL with the new 
# WORKDIR /node/deps/openssl/config
# make # this will update files in /node/deps/openssl/config/archs/ which we need to build openssl for Node
## END upgrade
############################################

# go to node folder
WORKDIR /node

# build and install node
# asm-mode (better perf) currently doesn't seem to work, no idea yet why... 
RUN 				\
	./configure --openssl-no-asm	\
	&& make -j$(nproc) 	\
	&& make install
	
	
RUN git clone --depth 1 -b draft-15 https://github.com/rmarx/quicker.git /quicker
WORKDIR /quicker

RUN npm install typescript -g && npm install && tsc -p ./ 

##EXPOSE 4433/udp 4434/udp 4435/udp

ADD startup.sh /
RUN chmod +x /startup.sh
ENTRYPOINT ["/startup.sh"]
#CMD [ "tail", "-f", "/dev/null" ]
