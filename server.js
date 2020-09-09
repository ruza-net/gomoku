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

const gameMod = {
  quick: {},
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
  quickPlayersQue.push(socket.id);
  if (quickPlayersQue.length >= 2) {
    let roomID = genID(quickGamesObject, 7);
    quickGamesObject[roomID] = {
      players: [],
      nicks: {},
      first: null,
      round: 0,
      times: [
        [150, Date.now()],
        [150, Date.now()],
      ],
      won: null,
      gamePlan: gamePlan(),
    };

    searchNsp.to(quickPlayersQue[0]).emit("gameCreated", roomID);
    searchNsp.to(quickPlayersQue[1]).emit("gameCreated", roomID);

    quickPlayersQue.splice(0, 2);
  }

  socket.on("disconnect", function() {
    if (quickPlayersQue.includes(socket.id)) {
      let indexOfSocket = quickPlayersQue.indexOf(socket.id);
      quickPlayersQue.splice(indexOfSocket, 1);
    }
  });
});

quickNsp.on("connection", function(socket) {
  socket.on("gameJoined", function(roomID, username) {
    if (!quickGamesObject.hasOwnProperty(roomID)) {
      socket.emit("roomMissing");
    } else {
      if (quickGamesObject[roomID].players.length < 2) {
        socket.join(roomID);
        quickGamesObject[roomID].players.push(socket.id);
        quickGamesObject[roomID].nicks[socket.id] = username;
      }

      if (quickGamesObject[roomID].players.length === 2) {
        let rndN = Math.round(Math.random());
        quickGamesObject[roomID].first = rndN;
        quickNsp
          .to(roomID)
          .emit(
            "gameBegun",
            quickGamesObject[roomID].players[rndN],
            quickGamesObject[roomID].nicks
          );
        quickGamesObject[roomID].times[Math.abs(rndN)][1] = Date.now();
        quickGamesObject[roomID].timerDelta = setInterval(() => {
          if (
            quickGamesObject[roomID] &&
            quickGamesObject[roomID].won !== true
          ) {
            let timeArr = calibrateTime(quickGamesObject, roomID, quickNsp);
            quickGamesObject[roomID].times[Math.abs(rndN)][0] = timeArr[0];
            quickGamesObject[roomID].times[Math.abs(rndN)][1] += timeArr[1];
          }
        }, 1000);

        setTimeout(() => {
          if (quickGamesObject[roomID]) {
            quickGamesObject[roomID].won = false;
          }
        }, 3000);
      }
    }
  });

  socket.on("game click", function(roomID, xPos, yPos) {
    const round =
      quickGamesObject[roomID].round + quickGamesObject[roomID].first;
    const playersArr = quickGamesObject[roomID].players;
    const won = quickGamesObject[roomID].won;
    const gamePlan = quickGamesObject[roomID].gamePlan;

    if (
      playersArr[round % 2] === socket.id &&
      won === false &&
      gamePlan[xPos][yPos] === 0
    ) {
      clearInterval(quickGamesObject[roomID].timerDelta);

      quickGamesObject[roomID].gamePlan[xPos][yPos] = round % 2 ? "1" : "2";

      quickNsp
        .to(roomID)
        .emit(
          "click success",
          socket.id,
          round,
          xPos,
          yPos,
          quickGamesObject[roomID].times,
          playersArr
        );
      // IMPLEMENT LINES
      if (
        checkWin(quickGamesObject[roomID].gamePlan, yPos, xPos, round) != false
      ) {
        quickNsp.to(roomID).emit("win", socket.id);
        quickGamesObject[roomID].won = true;
      } else {
        quickGamesObject[roomID].times[Math.abs(round - 1) % 2][1] = Date.now();
        quickGamesObject[roomID].timerDelta = setInterval(() => {
          if (
            quickGamesObject[roomID] &&
            quickGamesObject[roomID].won !== true
          ) {
            let timeArr = calibrateTime(
              quickGamesObject[roomID].times[Math.abs(round - 1) % 2][1],
              quickGamesObject[roomID].times[Math.abs(round - 1) % 2][0],
              quickGamesObject[roomID].players[round % 2],
              roomID
            );
            quickGamesObject[roomID].times[Math.abs(round - 1) % 2][0] =
              timeArr[0];
            quickGamesObject[roomID].times[Math.abs(round - 1) % 2][1] +=
              timeArr[1];
          }
        }, 1000);
      }

      quickGamesObject[roomID].round++;
    } else {
    }
  });

  socket.on("disconnect", function() {
    let existingRooms = Object.keys(quickGamesObject);
    for (let room of existingRooms) {
      if (quickGamesObject[room].players.includes(socket.id)) {
        if (
          quickGamesObject[room].won == null ||
          quickGamesObject[room].won == false
        )
          quickNsp.to(room).emit("playerLeft");

        clearInterval(quickGamesObject[room].timerDelta);
        delete quickGamesObject[room];
      }
    }
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
    const round =
      privateGamesObject[roomID].round + privateGamesObject[roomID].first;
    const playersArr = privateGamesObject[roomID].players;
    const won = privateGamesObject[roomID].won;
    const gamePlan = privateGamesObject[roomID].gamePlan;

    if (
      playersArr[round % 2] === socket.id &&
      won === false &&
      gamePlan[xPos][yPos] === 0
    ) {
      clearInterval(privateGamesObject[roomID].timerDelta);

      privateGamesObject[roomID].gamePlan[xPos][yPos] = round % 2 ? "1" : "2";

      privateGameNsp
        .to(roomID)
        .emit(
          "click success",
          socket.id,
          round,
          xPos,
          yPos,
          privateGamesObject[roomID].times,
          playersArr
        );
      // IMPLEMENT LINES
      if (
        checkWin(privateGamesObject[roomID].gamePlan, yPos, xPos, round) !=
        false
      ) {
        privateGameNsp.to(roomID).emit("win", socket.id);
        privateGamesObject[roomID].won = true;
      } else {
        if (privateGamesObject[roomID].timedGame) {
          privateGamesObject[roomID].times[
            Math.abs(round - 1) % 2
          ][1] = Date.now();
          privateGamesObject[roomID].timerDelta = setInterval(() => {
            if (
              privateGamesObject[roomID] &&
              privateGamesObject[roomID].won !== true
            ) {
              let timeArr = calibrateTime(
                privateGamesObject[roomID].times[Math.abs(round - 1) % 2][1],
                privateGamesObject[roomID].times[Math.abs(round - 1) % 2][0],
                privateGamesObject[roomID].players[round % 2],
                roomID
              );
              privateGamesObject[roomID].times[Math.abs(round - 1) % 2][0] =
                timeArr[0];
              privateGamesObject[roomID].times[Math.abs(round - 1) % 2][1] +=
                timeArr[1];
            }
          }, 1000);
        }
      }
      privateGamesObject[roomID].round++;
    } else {
    }

    function checkWin(gamePlan, yPos, xPos, round) {
      const tile = round % 2 ? "1" : "2";

      let horizont = 0;
      let vertical = 0;
      let diagonalR = 0;
      let diagonalL = 0;
      for (let x = -4; x < 5; x++) {
        // * Horizontal check

        if (xPos + x >= 0 && xPos + x <= 14) {
          if (gamePlan[xPos + x][yPos] === tile) {
            horizont++;
          } else {
            horizont = 0;
          }
        }

        if (yPos + x >= 0 && yPos + x <= 14) {
          if (gamePlan[xPos][yPos + x] === tile) {
            vertical++;
          } else {
            vertical = 0;
          }
        }

        if (
          yPos + x >= 0 &&
          yPos + x <= 14 &&
          xPos + x >= 0 &&
          xPos + x <= 14
        ) {
          if (gamePlan[xPos + x][yPos + x] === tile) {
            diagonalR++;
          } else {
            diagonalR = 0;
          }
        }

        if (
          yPos + x >= 0 &&
          yPos + x <= 14 &&
          xPos - x >= 0 &&
          xPos - x <= 14
        ) {
          if (gamePlan[xPos - x][yPos + x] === tile) {
            diagonalL++;
          } else {
            diagonalL = 0;
          }
        }
        if (
          horizont >= 5 ||
          vertical >= 5 ||
          diagonalL >= 5 ||
          diagonalR >= 5
        ) {
          return "win";
        }
      }

      if (horizont >= 5 || vertical >= 5 || diagonalL >= 5 || diagonalR >= 5) {
        return "win";
      } else if (round === 225) {
        return "tie";
      } else {
        return false;
      }
    }
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
      gameMod.ranked.que.push({ id: socket.id, elo, username });

      if (gameMod.ranked.que.length >= 2) {
        let roomID = genID(gameMod.ranked.games, 7);
        gameMod.ranked.games[roomID] = {
          players: [],
          nicks: {},
          elo: {
            [gameMod.ranked.que[0].username]: gameMod.ranked.que[0].elo,
            [gameMod.ranked.que[1].username]: gameMod.ranked.que[1].elo,
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
          .to(gameMod.ranked.que[0].id)
          .emit("gameCreated", roomID);
        rankedSearchNsp
          .to(gameMod.ranked.que[1].id)
          .emit("gameCreated", roomID);

        gameMod.ranked.que.splice(0, 2);
      }
    });
  });

  socket.on("disconnect", function() {
    for (let queMember of gameMod.ranked.que) {
      if (queMember.id === socket.id) {
        let indexOfSocket = gameMod.ranked.que.indexOf(queMember);
        gameMod.ranked.que.splice(indexOfSocket, 1);
      }
    }
  });
});
rankedNsp.on("connection", function(socket) {
  let games = gameMod.ranked.games;

  socket.on("gameJoined", function(roomID, username) {
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
        rankedNsp.to(roomID).emit("gameBegun", game.players[rndN], game.nicks);
        game.times[rndN].timeStamp = Date.now();
        game.intervalLink = setInterval(() => {
          if (game) {
            if (game.won !== true) {
              let calibratedTime = calibrateTime(games, roomID, quickNsp);
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
  });

  socket.on("game click", function(roomID, xPos, yPos) {
    const game = gameMod.ranked.games[roomID];

    const round = game.round + game.first;

    if (
      game.players[round % 2] === socket.id &&
      game.won === false &&
      game.gamePlan[xPos][yPos] === 0
    ) {
      clearInterval(game.intervalLink);

      game.gamePlan[xPos][yPos] = round % 2 ? "1" : "2";

      rankedNsp
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
        //  ELO RATING MATH
        const id1 = Object.keys(game.nicks)[0];
        const id2 = Object.keys(game.nicks)[1];

        const oldELO1 = game.elo[game.nicks[id1]];
        const oldELO2 = game.elo[game.nicks[id2]];

        const R1 = Math.pow(10, oldELO1 / 400);
        const R2 = Math.pow(10, oldELO2 / 400);

        const E1 = R1 / (R1 + R2);
        const E2 = R2 / (R1 + R2);

        // ELO K-factor, taken from chess
        const K = 32;

        if (gameBoardState === "win") {
          const S1 = socket.id === id1 ? 1 : 0;
          const S2 = socket.id === id2 ? 1 : 0;

          const finalELO1 = Math.round(oldELO1 + K * (S1 - E1));
          const finalELO2 = Math.round(oldELO2 + K * (S2 - E2));

          updateElo(game.nicks[id1], finalELO1);
          updateElo(game.nicks[id2], finalELO2);

          const eloDiff = Math.abs(finalELO1 - oldELO1);

          console.log(eloDiff);

          rankedNsp.to(roomID).emit("win", socket.id, eloDiff);
        } else if (gameBoardState === "tie") {
          const S1 = 0.5;
          const S2 = 0.5;

          const finalELO1 = oldELO1 + K * (S1 - E1);
          const finalELO2 = oldELO2 + K * (S2 - E2);

          updateElo(game.nicks[id1], finalELO1);
          updateElo(game.nicks[id2], finalELO2);

          const eloDiff = Math.abs(finalELO1 - oldELO1);
          //@TODO finish tie state
          const tieGainerID = oldELO1 < finalELO1 ? id1 : id2;
          rankedNsp.to(roomID).emit("tie", eloDiff, tieGainerID);
        }

        game.won = true;
      } else {
        game.times[Math.abs(round - 1) % 2].timeStamp = Date.now();
        game.intervalLink = setInterval(() => {
          if (game && game.won !== true) {
            let calibratedTime = calibrateTime(
              gameMod.ranked.games,
              roomID,
              rankedNsp
            );
            game.times[Math.abs(round - 1) % 2].timeLeft = calibratedTime;
            game.times[Math.abs(round - 1) % 2].timeStamp = Date.now();
          }
        }, 1000);
      }

      game.round++;
    } else {
    }
  });

  socket.on("disconnect", function() {
    let existingRooms = Object.keys(gameMod.ranked.games);
    for (let room of existingRooms) {
      if (gameMod.ranked.games[room].players.includes(socket.id)) {
        if (
          gameMod.ranked.games[room].won == null ||
          gameMod.ranked.games[room].won == false
        )
          rankedNsp.to(room).emit("playerLeft");

        clearInterval(gameMod.ranked.games[room].intervalLink);
        delete gameMod.ranked.games[room];
      }
    }
  });
});

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
