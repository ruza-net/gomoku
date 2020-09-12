"use strict";
const mongoose = require("mongoose");
const UserSchema = new mongoose.Schema({
  username: {
    type: String,
    required: true,
  },
  googleId: {
    type: String,
  },
  email: {
    type: String,
    default: "test@mail.com",
  },
  isVerified: {
    type: Boolean,
    default: false,
  },
  password: {
    type: String,
    required: false,
  },
  date: {
    type: Date,
    default: Date.now,
  },
  colors: {
    type: String,
    default: "#ff006e,#3a86ff,#e70064",
  },
  gameBoard: {
    type: String,
    default: "normal",
  },
  elo: {
    type: Number,
    default: 1000,
  },
  admin: {
    type: Boolean,
    default: false,
  },
});

const User = mongoose.model("User", UserSchema);

module.exports = User;
