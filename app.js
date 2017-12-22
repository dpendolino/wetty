var express = require('express');
var http = require('http');
var https = require('https');
var path = require('path');
var server = require('socket.io');
var pty = require('pty.js');
var fs = require('fs');
var uuid = require('uuid/v4');
var exec = require('child_process').exec;

var opts = require('optimist')
  .options({
    sslkey: {
      demand: false,
      description: 'path to SSL key'
    },
    sslcert: {
      demand: false,
      description: 'path to SSL certificate'
    },
    sshhost: {
      demand: false,
      description: 'ssh server host'
    },
    sshport: {
      demand: false,
      description: 'ssh server port'
    },
    sshuser: {
      demand: false,
      description: 'ssh user'
    },
    sshauth: {
      demand: false,
      description: 'defaults to "password", you can use "publickey,password" instead'
    },
    port: {
      demand: true,
      alias: 'p',
      description: 'wetty listen port'
    },
  }).boolean('allow_discovery').argv;

var runhttps = false;
var sshport = 22;
var sshhost = 'localhost';
var sshauth = 'password,keyboard-interactive';
var globalsshuser = '';

if (opts.sshport) {
  sshport = opts.sshport;
}

if (opts.sshhost) {
  sshhost = opts.sshhost;
}

if (opts.sshauth) {
  sshauth = opts.sshauth
}

if (opts.sshuser) {
  globalsshuser = opts.sshuser;
}

if (opts.sslkey && opts.sslcert) {
  runhttps = true;
  opts['ssl'] = {};
  opts.ssl['key'] = fs.readFileSync(path.resolve(opts.sslkey));
  opts.ssl['cert'] = fs.readFileSync(path.resolve(opts.sslcert));
}

process.on('uncaughtException', function(e) {
  console.error('Error: ' + e);
});

var httpserv;

var app = express();
app.get('/wetty/ssh/:user', function(req, res) {
  res.sendfile(__dirname + '/public/wetty/index.html');
});
app.use('/', express.static(path.join(__dirname, 'public')));

if (runhttps) {
  httpserv = https.createServer(opts.ssl, app).listen(opts.port, function() {
    console.log('https on port ' + opts.port);
  });
} else {
  httpserv = http.createServer(app).listen(opts.port, function() {
    console.log('http on port ' + opts.port);
  });
}

var io = server(httpserv, {
  path: '/wetty/socket.io'
});
io.on('connection', function(socket) {
  var sshuser = '';
  var request = socket.request;
  console.log((new Date()) + ' Connection accepted.');
  var name = uuid();
  var challenge = socket.handshake.query.param;
  var user_id = socket.handshake.query.user_id;
  // console.log("challenge:");
  console.log(socket.handshake.query.param);
  console.log(socket.handshake.query.uid);
  /*if (challenge == undefined || challenge == '' || challenge == 'undefined'){
	    console.log(challenge);
    }
    else {*/
  var image = '';
  var network = 'bridge'
  switch (challenge.toLowerCase()) {
    default:
      network = 'none';
      // image = 'hello-world';
      image = 'ubuntu';
  }
  // '--security-opt', 'seccomp=/home/wetty/default.json',
  var term = pty.spawn(
    '/usr/bin/docker', [
      'run',
      '-ti',
      '--network', network,
      '-e', 'USER_ID=' + user_id,
      '-m', '256m',
      '--cpus', '.5',
      '--rm',
      '--name',
      name,
      image
    ], {
      name: 'xterm-256color',
      cols: 80,
      rows: 30
    });
  console.log((new Date()) + " PID=" + term.pid + " STARTED!")
  term.on('data', function(data) {
    socket.emit('output', data);
  });
  term.on('exit', function(code) {
    console.log((new Date()) + " PID=" + term.pid + " ENDED")
  });
  socket.on('resize', function(data) {
    term.resize(data.col, data.row);
  });
  socket.on('input', function(data) {
    term.write(data);
  });
  socket.on('disconnect', function() {
    term.end();
    exec('/usr/bin/docker rm -f ' + name);
  });
  //}
})
