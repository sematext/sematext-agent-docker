FROM node:4.3.0-slim
RUN apt-get update && apt-get install -y curl git && apt-get clean
RUN mkdir -p /usr/src/app
WORKDIR /usr/src/app
COPY package.json /usr/src/app/
COPY . /usr/src/app
RUN npm install -g && apt-get remove -y git

COPY ./run.sh /run.sh
RUN chmod +x /run.sh
EXPOSE 9000
CMD /run.sh

