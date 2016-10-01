const mongoose = require('mongoose');

let schema = new mongoose.Schema({
  'from' : String,
  'content' : String,
  'channel' : String,
  'date' : Date
});
let Message = mongoose.model('Message', schema);

module.exports = Message;
