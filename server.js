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

// , { origins: '*:*',
const io = socketIO(server, { cookie: false });
server.listen(PORT);

// quick
const quickGamesObject = {};
const quickPlayersQue = [];

// private
const privateGamesObject = {};

// ranked
const rankedGamesObject = {};
const rankedPlayersQue = [];

const gamePlan = () => {
  let gameArray = [];
  for (let x = 0; x < 15; x++) {
    gameArray.push([]);
    for (let y = 0; y < 15; y++) {
      gameArray[x].push(0);
    }
  }
  return gameArray;
};

// ? Managing Socket.IO instances
let commonNsp = io.of("/");
let searchNsp = io.of("/q/search");
let rankedSearchNsp = io.of("/r/search");
let quickNsp = io.of("/q/game");
let rankedGameNsp = io.of("/r/game");
let privateGameNsp = io.of("/p/game");
let waitingRoomNsp = io.of("/waiting");

commonNsp.on("connection", function(socket) {});

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
        [300, Date.now()],
        [300, Date.now()],
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
            let timeArr = reTime(
              quickGamesObject[roomID].times[Math.abs(rndN)][1],
              quickGamesObject[roomID].times[Math.abs(rndN)][0],
              quickGamesObject[roomID].players[Math.abs(rndN - 1)],
              roomID
            );
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
            let timeArr = reTime(
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
      waitingRoomNsp.to(roomID).emit("gameBegun", roomID);
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
        if (privateGamesObject[roomID].times[0]) {
          privateGamesObject[roomID].times[Math.abs(rndN)][1] = Date.now();
          privateGamesObject[roomID].timerDelta = setInterval(() => {
            if (
              privateGamesObject[roomID] &&
              privateGamesObject[roomID].won !== true
            ) {
              let timeArr = reTime(
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
        privateGamesObject[roomID].times[
          Math.abs(round - 1) % 2
        ][1] = Date.now();
        privateGamesObject[roomID].timerDelta = setInterval(() => {
          if (
            privateGamesObject[roomID] &&
            privateGamesObject[roomID].won !== true
          ) {
            let timeArr = reTime(
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

function reTime(timeStamp, restSeconds, enemyID, roomID) {
  let deltaTime = Date.now() - timeStamp;
  if (restSeconds - deltaTime / 1000 <= 0) {
    clearInterval(quickGamesObject[roomID].timerDelta);
    quickGamesObject[roomID].won = true;
    quickNsp.to(roomID).emit("win", enemyID);
  } else {
    return [restSeconds - deltaTime / 1000, deltaTime];
  }
}

function genID(compareObject, length) {
  if (length <= 0) return false;
  for (let x = 0; x < 100; x++) {
    let randID = Math.random()
      .toString(36)
      .substr(2, length)
      .toUpperCase();
    if (!compareObject.hasOwnProperty(randID)) {
      return randID;
    }
  }
}
