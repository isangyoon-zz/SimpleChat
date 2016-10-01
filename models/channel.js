const mongoose = require('mongoose');

let schema = new mongoose.Schema({
  '_id' : String,
  'private' : Boolean,
  'password' : String,
  'clientIds' : [String]
});
let Channel = mongoose.model('Channel', schema);

module.exports = Channel;
