"use strict";
const express = require("express");
const router = express.Router();
const { ensureAuthenticated, checkAuthenticated } = require("../config/auth");
const Room = require("../models/Room");

//? GAMES DASHBOARD
router.get("/", checkAuthenticated, (req, res) => {

  let username = (res.logged) ? req.user.username : "Guest";

  res.render("game_select", {
    username: username,
    active_page: "game_select",
    logged: res.logged
  });
});

//? MULTIPLAYER RANKED
router.get("/ranked", ensureAuthenticated, (req, res) => {
  res.render("ranked", {
    username: req.user.username,
    active_page: "multiplayer",
    logged: true
  });
});

//? MULTIPLAYER 
router.get("/normal", ensureAuthenticated, (req, res) => {
  Room.find().lean().exec(function (err, users) {
    let lobbies = (users.length > 0) ? users : "empty";
    let errors = [];
    res.render("normal", {
      username: req.user.username,
      active_page: "normal",
      logged: true,
      lobbies,
      active_players: req.app.locals.players,
      errors,
      roomID: "",
      roomName: ""
    });
  });
});

//? MULTIPLAYER CASUAL
router.get("/normal/game", ensureAuthenticated, (req, res) => {
  res.render("normal_game", {
    username: req.user.username,
    active_page: "",
    logged: true,
    roomName: req.query.roomName
  });
});

router.post("/normal/newlobby", (req, res) => {
  let roomName = req.body.newLobbyName;
  let roomPassword = req.body.newLobbyPassword;
  let roomPrivate = req.body.newLobbyPrivate;
  let oldRoomName = req.body.oldRoomName;
  let username = req.user.username;

  // Remove old room if empty
  Room.findOne({ name: oldRoomName }).then(room => {
    if (room) {
      for (let i = 0; i < room.players.length; i++) {
        if (room.players[i].username === username) {
          room.players.splice(i, 1);
        }
      }

      if (room.players.length === 0) room.remove();

    } else {
    }
  })

  // Create new room if valid name
  Room.findOne({ name: roomName }).then(room => {

    if (room) {
      // User exists
      Room.find().lean().exec(function (err, users) {
        let lobbies = (users.length > 0) ? users : "empty";
        let errors = [];
        errors.push({ msg: "Room with same name already exists" });
        res.render("normal", {
          username,
          active_page: "normal",
          logged: true,
          lobbies,
          active_players: req.app.locals.players,
          errors,
          roomName
        });
      });
    } else {
      const newRoom = new Room({
        players: [{ username }],
        password: roomPassword,
        private: roomPrivate,
        name: roomName
      });
      newRoom
        .save()
        .then(user => {
          Room.find().lean().exec(function (err, users) {
            let lobbies = (users.length > 0) ? users : "empty";
            let errors = [];
            res.render("normal", {
              username,
              active_page: "normal",
              logged: true,
              lobbies,
              active_players: req.app.locals.players,
              errors,
              roomID: newRoom.id,
              roomName
            });
          });
        })
        .catch((err) => console.log(err));
    }
  });
});

router.post("/normal/joinlobby", (req, res) => {
  let newRoomName = req.body.newRoomName;
  let oldRoomName = req.body.oldRoomName;
  let username = req.user.username;

  if (newRoomName !== oldRoomName) {
    // Remove old room if empty
    Room.findOne({ name: oldRoomName }).then(room => {
      if (room) {
        for (let i = 0; i < room.players.length; i++) {
          if (room.players[i].username === username) {
            room.players.splice(i, 1);
          }
        }

        if (room.players.length === 0) room.remove();
      } else {

      }
    }).catch(err => console.log(err));

    Room.findOne({ name: newRoomName }).then(room => {

      if (room) {
        // Room exists

        room.players.push({ username });
        room.save().then(user => {
          Room.find().lean().exec(function (err, users) {

            let lobbies = (users.length > 0) ? users : "empty";
            let errors = [];
            res.render("normal", {
              username,
              active_page: "normal",
              logged: true,
              lobbies,
              active_players: req.app.locals.players,
              errors,
              roomID: room._id,
              roomName: newRoomName
            });
          });
        }).catch((err) => console.log(err));

      } else {
        throw "something went wrong";
      }
    });
  }
});

//? LOCAL MATCH
router.get("/local", checkAuthenticated, (req, res) => {

  let username = (res.logged) ? req.user.username : "Guest";

  res.render("local", {
    username: username,
    active_page: "local",
    logged: res.logged
  });
});

//? BOT MATCH
router.get("/ai", checkAuthenticated, (req, res) => {

  let username = (res.logged) ? req.user.username : "Guest";

  res.render("ai", {
    username: username,
    active_page: "ai",
    logged: res.logged
  });
});

module.exports = router;
