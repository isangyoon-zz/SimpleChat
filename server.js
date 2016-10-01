var express = require('express');
var bodyParser = require('body-parser');
var mqtt = require('mqtt');
var mongoose = require('mongoose');
var mosca = require('mosca');
var bcrypt = require('bcrypt');

// Models
var Room = require('./models/room');
var Message = require('./models/message');

var app = express();
var server = require('http').createServer(app);
server.listen(8080);

// Express Configurations
app.use('/styles', express.static(__dirname + '/public/styles'));
app.use('/scripts', express.static(__dirname + '/public/scripts'));
app.use('/images', express.static(__dirname + '/public/images'));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ 'extended' : true }));

app.get('/', function (request, response) {
  response.sendFile(__dirname + '/public/index.html');
});

app.post('/create', function (request, response) {
  let room = request.body.room;
  let password = request.body.password;

  Room.update({
    '_id' : room
  }, { '$set' : {
    'password' : bcrypt.hashSync(password, 10),
    'private' : true }
  }, {
      'upsert' : true
  }).then(function(document) {
    response.sendStatus(200);
  }).catch(function(error) {
    response.sendStatus(500);
  });
});

app.post('/check', function (request, response) {
  let room = request.body.room;
  let password = request.body.password;

  Room.findOne({
    '_id' : room
  }).then(function(document) {
    if (bcrypt.compareSync(password, document.password)) response.sendStatus(200);
    else response.sendStatus(401);
  }).catch(function(error) {
    response.sendStatus(401);
  });
});

// Mongoose Configurations
mongoose.connect('mongodb://localhost:27017/chat');
mongoose.Promise = global.Promise;

// Mosca Settings
var options = {
  'type' : 'mongo',
  'url' : 'mongodb://localhost:27017/mosca',
  'pubsubCollection' : 'messages',
  'mongo' : {}
};

var settings = {
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
var ChatServer = new mosca.Server(settings);
var ChatClient = mqtt.connect('ws://localhost:1884', { 'keepalive' : 0 });

process.on('SIGINT', function() {
  ChatClient.end();
  Room.remove({}, function(error) {});
});

const ReservedTopics = ['createroom', 'removeroom', 'totalrooms', 'totalusers', 'online', 'offline'];

ChatServer.on('published', function(packet, client) {
  if (ReservedTopics.indexOf(packet.topic) === -1 && !packet.topic.includes('$SYS'))
  {
    let json = JSON.parse(packet.payload.toString('utf-8'));
    let message = new Message({
      'from' : json.nickname,
      'content' : json.message,
      'room' : packet.topic,
      'date' : new Date()
    });

    message.save();
  }
});

ChatServer.on('subscribed', function(topic, client) {
  if (ReservedTopics.indexOf(topic) === -1)
  {
    let json = JSON.stringify({
      'room' : topic,
      'nickname' : client.id
    });
    getClient().publish('online', json);

    construct(topic, client); // add Channel and Client
  }
});

ChatServer.on('unsubscribed', function(topic, client) {
  if (ReservedTopics.indexOf(topic) === -1)
  {
    let json = JSON.stringify({
      'room' : topic,
      'nickname' : client.id
    });
    getClient().publish('offline', json);

    destruct(topic, client); // remove Channel and Client
  }
});

// Helper functions
function construct(topic, client)
{
  Room.update({
    '_id' : topic
  }, {
    '$push' : {
      'clientIDs' : client.id
    }
  }, {
    'upsert' : true
  }).then(function(document) {
    notifyAllRooms();
    notifyAllUsers(topic);
  });
}

function destruct(topic, client)
{
  Room.update({
    '_id' : topic
  }, {
    '$pull' : {
      'clientIDs' : client.id
    }
  }, {
    'upsert' : true
  }).then(function(document) {
    Room.findOne({
      '_id' : topic
    }, '_id clientIDs private').then(function(document) {
      if (document.clientIDS.length > 0)
      {
        notifyAllRooms();
        notifyAllUsers(topic);
      }
      else
      {
        Room.remove({
          '_id' : topic
        }, function(error) {
          if (!error) getClient().publish('removeroom', JSON.stringify({ 'room' : topic }));
        });
      }
    });
  });
}

function notifyAllRooms()
{
  Room.find({}, '_id clientIDs private').then(function(documents) {
    getClient().publish('totalrooms', JSON.stringify(documents));
  });
}

function notifyAllUsers(topic)
{
  Room.findOne({
    '_id' : topic
  }, '_id clientIDs private').then(function(document) {
    getClient().publish('totalusers', JSON.stringify(document));
  });
}

var onPersistenceReady = function() { persistence.wire(server); };
var persistence = mosca.persistence.Mongo(options, onPersistenceReady);

var getClient = function() {
  if (!ChatClient || !ChatClient.connected) ChatClient = mqtt.connect('ws://localhost:1884', { 'keepalive' : 0 });

  return ChatClient;
};
