var https = require('https')
var serveIndex = require('serve-index');
var express = require('express');
var fs = require('fs');
var options = {
    key:fs.readFileSync('./cert/av.syocn.com.key'),
    cert:fs.readFileSync('./cert/av.syocn.com.pem')
}
var app = express();


app.use(express.static('./'));
app.use(serveIndex('./'));

var server = https.createServer(options,app);

server.listen(443, '0.0.0.0', () => {
    console.log("server start ok...");
});
