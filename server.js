const express = require('express');
const bodyParser = require('body-parser');
const mosca = require('mosca');
const mqtt = require('mqtt');
const mongoose = require('mongoose');

// Models
var Channel = require('./models/channel');
var Message = require('./models/message');

var app = express();
var server = require('http').createServer(app);
server.listen(3000);

// Mongoose Configurations
mongoose.Promise = global.Promise;
mongoose.connect('mongodb://localhost:27017/chat');

// Express Configurations
app.use('/styles', express.static(__dirname + '/public/styles'));
app.use('/scripts', express.static(__dirname + '/public/scripts'));
app.use('/images', express.static(__dirname + '/public/images'));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ 'extended' : true }));

app.get('/', function(request, response) {
  response.sendFile(__dirname + '/public/index.html');
});

app.post('/private', function(request, response) {
  let channel = request.body.channel;
  let password = request.body.password;

  Room.update({
    '_id' : channel
  }, {
    '$set' : {
      'password' : password,
      'private' : true
    }
  }, {
    'upsert' : true
  }).then(function(document) {
    response.sendStatus(200);
  }).catch(function(error) {
    response.sendStatus(500);
  });
});

app.post('/check', function(request, response) {
  let channel = request.body.channel;
  let password = request.body.password;

  Room.findOne({
    '_id' : channel
  }).then(function(document) {
    if (password == document.password) response.sendStatus(200);
    else response.sendStatus(401);
  }).catch(function(error) {
    response.sendStatus(401);
  });
});

// Mosca Settings
let options = {
  'type' : 'mongo',
  'url' : 'mongodb://localhost:27017/mqtt',
  'pubsubCollection' : 'messages',
  'mongo' : {}
};

let settings = {
  'port' : 1883,
  'stats' : false,
  'logger' : {},
  'http' : {
    'port' : 1884,
    'static' : __dirname + '/public',
    'bundle' : true
  },
  'backend' : options
};

// Chatting Server (PubSub)
let ChatServer = new mosca.Server(settings);
let ChatClient = mqtt.connect('ws://localhost:1884', { 'keepalive' : 0 });

process.on('SIGINT', function() {
  ChatClient.end();

  Channel.remove({}, function(error) {});
});

const ReservedWords = ['createchannel', 'removechannel', 'totalchannels', 'totalclients', 'online', 'offline'];
ChatServer.on('published', function(packet, client) {
  if (ReservedWords.indexOf(packet.topic) === -1 && !packet.topic.includes('$SYS'))
  {
    let json = JSON.parse(packet.payload.toString('utf-8'));
    let message = new Message({
      'from' : json.nickname,
      'content' : json.message,
      'channel' : packet.topic,
      'date' : new Date()
    });

    message.save();
  }
});

ChatServer.on('subscribed', function(topic, client) {
  if (ReservedWords.indexOf(topic) === -1)
  {
    let json = JSON.stringify({
      'channel' : topic,
      'nickname' : client.id
    });

    getClient().publish('online', json);
    create(topic, client); // add Channel and Client
  }
});

ChatServer.on('unsubscribed', function(topic, client) {
  if (ReservedWords.indexOf(topic) === -1)
  {
    let json = JSON.stringify({
      'channel' : topic,
      'nickname' : client.id
    });

    getClient().publish('offline', json);
    destroy(topic, client); // remove Channel and Client
  }
});

// Helper functions
function create(topic, client)
{
  Channel.update({
    '_id' : topic
  }, {
    '$push' : {
      'clientIds' : client.id
    }
  }, {
    'upsert' : true
  }).then(function(topic) {
    broadcastAllChannels();
    broadcastAllClients(topic);
  });
}

function destroy(topic, client)
{
  Channel.update({
    '_id' : topic
  }, {
    '$pull' : {
      'clientIds' : client.id
    }
  }, {
    'upsert' : true
  }).then(function(document) {
    if (document.clientIds.length > 0)
    {
      broadcastAllChannels();
      broadcastAllClients(topic);
    }
    else
    {
      Channel.remove({
        '_id' : topic
      }, function(error) {
        if (!error) getClient().publish('removechannel', JSON.stringify({ 'channel' : topic }));
      });
    }
  });
}

function broadcastAllChannels()
{
  Channel.find({}, '_id clientIds private').then(function(documents) {
    getClient().publish('totalchannels', JSON.stringify(documents));
  });
}

function broadcastAllClients()
{
  Channel.find({}, '_id clientIds private').then(function(document) {
    getClient().publish('totalclients', JSON.stringify(document));
  });
}

var onPersistenceReady = function() { persistence.wire(server); };
var persistence = mosca.persistence.Mongo(options, onPersistenceReady);

var getClient = function() {
  if (!ChatClient || !ChatClient.connected) ChatClient = mqtt.connect('ws://localhost:1884', { 'keepalive' : 0 });

  return ChatClient;
};
