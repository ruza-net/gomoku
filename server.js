"use strict";
// ? IN DEVELOP LOAD CONFIG >> MONGODB KEY
if (process.env.NODE_ENV !== "production") {
  require("dotenv/config");
}

// * IMPORTS
// ? EXPRESS
const express = require("express");
const app = express();
const compression = require("compression");

// ? MONGOOSE
const mongoose = require("mongoose");
const User = require("./models/User");

// ? PASSPORT and SESSION
const passport = require("passport");
const session = require("cookie-session");
const cors = require("cors");

// ? SOCKET.IO + HTTP
const socketIO = require("socket.io");
const http = require("http");

// ? PASSPORT CONFIG
require("./config/passport")(passport);

// ? EXPRESS BODYPARSER
app.use(express.json()); // to support JSON-encoded bodies
app.use(express.urlencoded({ extended: true })); // to support URL-encoded bodies

// ? EXPRESS SESSION
app.use(
  session({
    secret: "secret",
    resave: true,
    saveUninitialized: true,
    cookie: { expires: new Date(253402300000000) },
  })
);

// ? PASSPORT MIDDLEWARE
app.use(passport.initialize());
app.use(passport.session());

// ? ROUTES
const apiRouter = require("./routes/api");
const indexRouter = require("./routes/index");
app.use("/api/", apiRouter);
app.use("/", indexRouter);

app.use(compression());
if (process.env.NODE_ENV === "production" || true) {
  //Static folder
  app.use(express.static(__dirname + "/public/"));

  // Handle SPA

  app.get(/.*/, (req, res) => res.sendFile(__dirname + "/public/index.html"));
}

// ? MongoDB Constructor and URL parser deprecation warning fix
mongoose.set("useUnifiedTopology", true);
mongoose.set("useNewUrlParser", true);
mongoose.set("useFindAndModify", false);

// ? DB connection
mongoose.connect(process.env.DB_CONNECTION);
const db = mongoose.connection;

db.on("error", (error) => console.error(error));
db.once("open", () => console.log("Connected to Mongoose"));

const PORT = process.env.PORT || 3000;

const server = http.Server(app);

const genID = require("./utils/genUniqueID");
const checkWin = require("./utils/checkWin");
const gamePlan = require("./utils/genGamePlan");
const calibrateTime = require("./utils/calibrateTime");

// , { origins: '*:*',
const io = socketIO(server);
server.listen(PORT);

// quick
const quickGamesObject = {};
const quickPlayersQue = [];

// private
const privateGamesObject = {};

// ranked
const rankedGamesObject = {};
const rankedPlayersQue = [];

const gameMode = {
  quick: {
    que: [],
    games: {},
  },
  private: {},
  ranked: {
    que: [],
    games: {},
  },
};

// ? Managing Socket.IO instances
let searchNsp = io.of("/q/search");
let rankedSearchNsp = io.of("/r/search");
let quickNsp = io.of("/q/game");
let rankedNsp = io.of("/r/game");
let privateGameNsp = io.of("/p/game");
let waitingRoomNsp = io.of("/waiting");

searchNsp.on("connection", function(socket) {
  gameMode.quick.que.push(socket.id);
  if (gameMode.quick.que.length >= 2) {
    let roomID = genID(gameMode.quick.games, 7);
    gameMode.quick.games[roomID] = {
      players: [],
      nicks: {},
      first: null,
      round: 0,
      intervalLink: null,
      times: [
        { timeLeft: 150, timeStamp: Date.now() },
        { timeLeft: 150, timeStamp: Date.now() },
      ],
      won: null,
      gamePlan: gamePlan(),
    };

    searchNsp.to(gameMode.quick.que[0]).emit("gameCreated", roomID);
    searchNsp.to(gameMode.quick.que[1]).emit("gameCreated", roomID);

    gameMode.quick.que.splice(0, 2);
  }

  socket.on("disconnect", function() {
    if (gameMode.quick.que.includes(socket.id)) {
      let indexOfSocket = gameMode.quick.que.indexOf(socket.id);
      gameMode.quick.que.splice(indexOfSocket, 1);
    }
  });
});

quickNsp.on("connection", function(socket) {
  let games = gameMode.quick.games;
  socket.on("gameJoined", function(roomID, username) {
    startGame(games, roomID, username, quickNsp, socket);
  });

  socket.on("game click", function(roomID, xPos, yPos) {
    gameClick(games, roomID, xPos, yPos, false, quickNsp, socket);
  });

  socket.on("disconnect", function() {
    playerDisconnected(games, false, quickNsp, socket);
  });
});

waitingRoomNsp.on("connection", function(socket, username) {
  socket.on("createRoom", function(timeInMinutes) {
    let roomID = genID(privateGamesObject, 4);
    privateGamesObject[roomID] = {
      players: [],
      nicks: {},
      first: null,
      round: 0,
      timedGame: timeInMinutes,
      times: [
        [timeInMinutes * 60, Date.now()],
        [timeInMinutes * 60, Date.now()],
      ],
      won: null,
      gamePlan: gamePlan(),
    };

    socket.join(roomID);
    socket.emit("roomGenerated", roomID);
  });
  socket.on("roomJoined", function(roomID) {
    if (privateGamesObject.hasOwnProperty(roomID)) {
      socket.join(roomID);

      privateGamesObject[roomID].won = false;
      waitingRoomNsp
        .to(roomID)
        .emit("gameBegun", roomID, privateGamesObject[roomID].times[0][0]);
    } else {
      socket.emit("room invalid");
    }
  });
  socket.on("disconnect", function() {
    let existingRooms = Object.keys(privateGamesObject);
    for (let room of existingRooms) {
      if (privateGamesObject[room].players.includes(socket.id)) {
        if (privateGamesObject[room].won === null)
          delete privateGamesObject[room];
      }
    }
  });
});

privateGameNsp.on("connection", function(socket) {
  socket.on("gameJoined", function(roomID, username) {
    if (!privateGamesObject.hasOwnProperty(roomID)) {
      socket.emit("roomMissing");
    } else {
      privateGamesObject[roomID].won = null;
      if (privateGamesObject[roomID].players.length < 2) {
        socket.join(roomID);
        privateGamesObject[roomID].players.push(socket.id);
        privateGamesObject[roomID].nicks[socket.id] = username;
      }
      socket.join(roomID);
      if (privateGamesObject[roomID].players.length === 2) {
        let rndN = Math.round(Math.random());
        privateGamesObject[roomID].first = rndN;
        privateGameNsp
          .to(roomID)
          .emit(
            "gameBegun",
            privateGamesObject[roomID].players[rndN],
            privateGamesObject[roomID].nicks
          );
        if (privateGamesObject[roomID].timedGame) {
          privateGamesObject[roomID].times[Math.abs(rndN)][1] = Date.now();
          privateGamesObject[roomID].timerDelta = setInterval(() => {
            if (
              privateGamesObject[roomID] &&
              privateGamesObject[roomID].won !== true
            ) {
              let timeArr = calibrateTime(
                privateGamesObject[roomID].times[Math.abs(rndN)][1],
                privateGamesObject[roomID].times[Math.abs(rndN)][0],
                privateGamesObject[roomID].players[Math.abs(rndN - 1)],
                roomID
              );
              privateGamesObject[roomID].times[Math.abs(rndN)][0] = timeArr[0];
              privateGamesObject[roomID].times[Math.abs(rndN)][1] += timeArr[1];
            }
          }, 1000);
        }

        setTimeout(() => {
          if (privateGamesObject[roomID]) {
            privateGamesObject[roomID].won = false;
          }
        }, 3000);
      }
    }
  });

  socket.on("game click", function(roomID, xPos, yPos) {
    gameClick();
  });

  socket.on("disconnect", function() {
    let existingRooms = Object.keys(privateGamesObject);
    for (let room of existingRooms) {
      if (privateGamesObject[room].players.includes(socket.id)) {
        if (
          privateGamesObject[room].won == null ||
          privateGamesObject[room].won == false
        )
          privateGameNsp.to(room).emit("playerLeft");

        clearInterval(privateGamesObject[room].timerDelta);
        delete privateGamesObject[room];
      }
    }
  });
});

rankedSearchNsp.on("connection", function(socket) {
  socket.on("beginSearch", function(username) {
    // Assign Elo
    getUserElo(username, (err, elo) => {
      if (err) console.log(err);
      gameMode.ranked.que.push({ id: socket.id, elo, username });

      if (gameMode.ranked.que.length >= 2) {
        let roomID = genID(gameMode.ranked.games, 7);
        gameMode.ranked.games[roomID] = {
          players: [],
          nicks: {},
          elo: {
            [gameMode.ranked.que[0].username]: gameMode.ranked.que[0].elo,
            [gameMode.ranked.que[1].username]: gameMode.ranked.que[1].elo,
          },
          first: null,
          round: 0,
          intervalLink: null,
          times: [
            { timeLeft: 150, timeStamp: Date.now() },
            { timeLeft: 150, timeStamp: Date.now() },
          ],
          won: null,
          gamePlan: gamePlan(),
        };

        rankedSearchNsp
          .to(gameMode.ranked.que[0].id)
          .emit("gameCreated", roomID);
        rankedSearchNsp
          .to(gameMode.ranked.que[1].id)
          .emit("gameCreated", roomID);

        gameMode.ranked.que.splice(0, 2);
      }
    });
  });

  socket.on("disconnect", function() {
    for (let queMember of gameMode.ranked.que) {
      if (queMember.id === socket.id) {
        let indexOfSocket = gameMode.ranked.que.indexOf(queMember);
        gameMode.ranked.que.splice(indexOfSocket, 1);
      }
    }
  });
});
rankedNsp.on("connection", function(socket) {
  let games = gameMode.ranked.games;

  socket.on("gameJoined", function(roomID, username) {
    startGame(games, roomID, username, rankedNsp, socket);
  });

  socket.on("game click", function(roomID, xPos, yPos) {
    gameClick(games, roomID, xPos, yPos, true, rankedNsp, socket);
  });

  socket.on("disconnect", function() {
    playerDisconnected(games, true, rankedNsp, socket);
  });
});

/**
 *
 * @param {Object} games existing games from certain gameType
 * @param {Boolean} rated does ELO need to be calculated
 * @param {Object} namespace socket.io namespace
 * @param {Object} socket socket.io instance
 */
function playerDisconnected(games, rated, namespace, socket) {
  let existingRooms = Object.keys(games);
  for (let room of existingRooms) {
    if (games[room].players.includes(socket.id)) {
      if (games[room].won == null || games[room].won == false) {
        if (rated) {
          calcAndUpdateELO(games[room], "left", socket, (eloDiff) => {
            namespace.to(room).emit("playerLeft", eloDiff);
          });
        } else {
          namespace.to(room).emit("playerLeft");
        }
      }

      clearInterval(games[room].intervalLink);
      delete games[room];
    }
  }
}

/**
 *
 * @param {Object} games existing games from certain gameType
 * @param {String} roomID
 * @param {Number} xPos
 * @param {Number} yPos
 * @param {Boolean} rated
 * @param {Object} namespace Socket.io namespace
 * @param {Object} socket Socket.io instance
 */
function gameClick(games, roomID, xPos, yPos, rated, namespace, socket) {
  const game = games[roomID];

  const round = game.round + game.first;

  if (
    game.players[round % 2] === socket.id &&
    game.won === false &&
    game.gamePlan[xPos][yPos] === 0
  ) {
    clearInterval(game.intervalLink);

    game.gamePlan[xPos][yPos] = round % 2 ? "1" : "2";

    namespace
      .to(roomID)
      .emit(
        "click success",
        socket.id,
        round,
        xPos,
        yPos,
        game.times,
        game.players
      );

    const gameBoardState = checkWin(game.gamePlan, yPos, xPos, round);
    if (gameBoardState !== false) {
      if (gameBoardState === "win") {
        if (rated) {
          calcAndUpdateELO(game, "win", socket, (eloDiff) => {
            namespace.to(roomID).emit("win", socket.id, eloDiff);
          });
        } else {
          namespace.to(roomID).emit("win", socket.id);
        }
      } else if (gameBoardState === "tie") {
        if (rated) {
          calcAndUpdateELO(game, "tie", socket, (eloDiff, tieGainerID) => {
            namespace.to(roomID).emit("tie", eloDiff, tieGainerID);
          });
        } else {
          namespace.to(roomID).emit("tie");
        }
      }

      game.won = true;
    } else {
      game.times[Math.abs(round - 1) % 2].timeStamp = Date.now();
      game.intervalLink = setInterval(() => {
        if (game && game.won !== true) {
          let calibratedTime = calibrateTime(games, roomID, namespace);
          game.times[Math.abs(round - 1) % 2].timeLeft = calibratedTime;
          game.times[Math.abs(round - 1) % 2].timeStamp = Date.now();
        }
      }, 1000);
    }

    game.round++;
  }
}

/**
 * Calculates new ELO, callback emits to rooms with ELO diff, updatesELO in mongo
 * @param {Object} game
 * @param {String} gameEnding "win"|"tie"
 * @param {Object} socket socket.io instance
 * @param {Function} callback
 */
function calcAndUpdateELO(game, gameEnding, socket, callback) {
  const id1 = Object.keys(game.nicks)[0];
  const id2 = Object.keys(game.nicks)[1];

  //  ELO RATING MATH

  const oldELO1 = game.elo[game.nicks[id1]];
  const oldELO2 = game.elo[game.nicks[id2]];

  const R1 = Math.pow(10, oldELO1 / 400);
  const R2 = Math.pow(10, oldELO2 / 400);

  const E1 = R1 / (R1 + R2);
  const E2 = R2 / (R1 + R2);

  // ELO K-factor, taken from chess
  const K = 32;

  let finalELO1, finalELO2;

  if (gameEnding === "win") {
    const S1 = socket.id === id1 ? 1 : 0;
    const S2 = socket.id === id2 ? 1 : 0;

    finalELO1 = Math.round(oldELO1 + K * (S1 - E1));
    finalELO2 = Math.round(oldELO2 + K * (S2 - E2));

    const eloDiff = Math.abs(oldELO1 - finalELO1);

    callback(eloDiff);
  } else if (gameEnding === "tie") {
    const S1 = 0.5;
    const S2 = 0.5;

    finalELO1 = oldELO1 + K * (S1 - E1);
    finalELO2 = oldELO2 + K * (S2 - E2);

    const eloDiff = Math.abs(oldELO1 - finalELO1);
    const tieGainerID = oldELO1 < finalELO1 ? id1 : id2;

    callback(eloDiff, tieGainerID);
  } else if (gameEnding === "left") {
    const S1 = socket.id === id1 ? 0 : 1;
    const S2 = socket.id === id2 ? 0 : 1;

    finalELO1 = Math.round(oldELO1 + K * (S1 - E1));
    finalELO2 = Math.round(oldELO2 + K * (S2 - E2));

    const eloDiff = Math.abs(oldELO1 - finalELO1);

    callback(eloDiff);
  }

  updateElo(game.nicks[id1], finalELO1);
  updateElo(game.nicks[id2], finalELO2);
}

/**
 * Finds game created in search (if not then send 404), picks random first player and sets time interval
 * @param {Object} games existing games from certain gameType
 * @param {String} roomID
 * @param {String} username
 * @param {Object} namespace socket.io namespace (e.g rankedNsp, quickNsp)
 * @param {Object} socket socket.io instance
 */
function startGame(games, roomID, username, namespace, socket) {
  // Check if room exists, otherwise send to 404
  if (!games.hasOwnProperty(roomID)) {
    socket.emit("roomMissing");
  } else {
    let game = games[roomID];
    if (game.players.length < 2) {
      socket.join(roomID);
      game.players.push(socket.id);
      game.nicks[socket.id] = username;
    }

    if (game.players.length === 2) {
      // taking random number representing player (0/1)
      let rndN = Math.round(Math.random());
      game.first = rndN;
      namespace.to(roomID).emit("gameBegun", game.players[rndN], game.nicks);
      game.times[rndN].timeStamp = Date.now();
      game.intervalLink = setInterval(() => {
        if (game) {
          if (game.won !== true) {
            let calibratedTime = calibrateTime(games, roomID, namespace);
            game.times[rndN].timeLeft = calibratedTime;
            game.times[rndN].timeStamp = Date.now();
          }
        }
      }, 1000);

      setTimeout(() => {
        if (games[roomID]) {
          games[roomID].won = false;
        }
      }, 3000);
    }
  }
}

/**
 *
 * @param {String} username
 * @param {Number} newElo
 * @return {Boolean} true\false
 */
function updateElo(username, newElo) {
  User.findOneAndUpdate({ username }, { elo: newElo })
    .then(() => {})
    .catch((err) => {
      console.log(err);
    });
}

/**
 *
 * @param {String} username
 * @param {Function} callback
 * @return {Number} Elo
 */
function getUserElo(username, callback) {
  User.findOne({ username: username }).then((user) => {
    if (user) {
      callback(null, user.elo);
    } else {
      const err = new Error("User does not exist");
      callback(err, null);
    }
  });
}
