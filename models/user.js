const mongoose = require('mongoose');

var schema = new mongoose.Schema({
  '_id' : String,
  'password' : String,
  'nickname' : String
});

var User = mongoose.model('User', schema);

module.exports = User;
