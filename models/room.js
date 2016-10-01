const mongoose = require('mongoose');

var schema = new mongoose.Schema({
  '_id' : String,
  'password' : String,
  'clientIDs' : [String],
  'private' : Boolean
});

var Room = mongoose.model('Room', schema);

module.exports = Room;
