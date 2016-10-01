const mongoose = require('mongoose');

var schema = new mongoose.Schema({
  'from' : String,
  'to' : String,
  'content' : String,
  'room' : String,
  'date' : Date
});

var Message = mongoose.model('Message', schema);

module.exports = Message;
