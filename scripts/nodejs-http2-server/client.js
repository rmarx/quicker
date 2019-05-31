const http2 = require('http2');
const fs = require('fs');
const clientSession = http2.connect('https://localhost:8443', {
  ca: fs.readFileSync('localhost-cert.pem')
});

var util = require('util');
var log_file = fs.createWriteStream(__dirname + '/tcp.log', {flags : 'w'});
var log_stdout = process.stdout;

console.log = function(d) { //
  log_file.write(util.format(d) + '\n');
  log_stdout.write(util.format(d) + '\n');
};


const {
  HTTP2_HEADER_PATH,
  HTTP2_HEADER_STATUS
} = http2.constants;

console.log("Start time: ");
console.log(Date.now());


let files = ['/index.html', '/index_massive.html'];
let req_obj = []
let count = 0

files.forEach((filePath) => {
  const req = clientSession.request({ [HTTP2_HEADER_PATH]: filePath });
  req_obj.push(req);

  req.on('response', (headers) => {
    //console.log(headers[HTTP2_HEADER_STATUS]);

    req.on('data', (chunk) => { 
      //console.log("received chunk: " + filePath)
      //console.log(`\n${chunk}`) 
    });

    req.on('end', () => { 
        console.log("file "+ filePath +" received:");
        console.log(Date.now());
        count++;
        if(count == files.length){
          process.exit();
        }
    });
  });
})

