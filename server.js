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

// app.use(compression());
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

const gamesObject = {};
const playersQue = [];

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
let searchNsp = io.of("/search");
let quickNsp = io.of("/quick");
searchNsp.on("connection", function(socket) {
  playersQue.push(socket.id);
  if (playersQue.length >= 2) {
    let roomID = genID(gamesObject);
    gamesObject[roomID] = {
      players: [],
      first: null,
      round: 0,
      times: [
        [300, Date.now()],
        [300, Date.now()],
      ],
      won: null,
      gamePlan: gamePlan(),
    };

    searchNsp.to(playersQue[0]).emit("gameCreated", roomID);
    searchNsp.to(playersQue[1]).emit("gameCreated", roomID);

    playersQue.splice(0, 2);
  }

  socket.on("disconnect", function() {
    if (playersQue.includes(socket.id)) {
      let indexOfSocket = playersQue.indexOf(socket.id);
      playersQue.splice(indexOfSocket, 1);
    }
  });
});

quickNsp.on("connection", function(socket) {
  socket.on("gameJoined", function(roomID) {
    if (!gamesObject.hasOwnProperty(roomID)) {
      socket.emit("roomMissing");
    } else {
      if (gamesObject[roomID].players.length < 2) {
        socket.join(roomID);
        gamesObject[roomID].players.push(socket.id);
      }

      if (gamesObject[roomID].players.length === 2) {
        let rndN = Math.round(Math.random());
        gamesObject[roomID].first = rndN;
        quickNsp
          .to(roomID)
          .emit("gameBegun", gamesObject[roomID].players[rndN]);
        gamesObject[roomID].times[Math.abs(rndN)][1] = Date.now();
        gamesObject[roomID].timerDelta = setInterval(() => {
          if (gamesObject[roomID] && gamesObject[roomID].won !== true) {
            let timeArr = reTime(
              gamesObject[roomID].times[Math.abs(rndN)][1],
              gamesObject[roomID].times[Math.abs(rndN)][0],
              gamesObject[roomID].players[Math.abs(rndN - 1)],
              roomID
            );
            gamesObject[roomID].times[Math.abs(rndN)][0] = timeArr[0];
            gamesObject[roomID].times[Math.abs(rndN)][1] += timeArr[1];
          }
        }, 1000);

        setTimeout(() => {
          if (gamesObject[roomID]) {
            gamesObject[roomID].won = false;
          }
        }, 3000);
      }
    }
  });

  socket.on("game click", function(roomID, xPos, yPos) {
    const round = gamesObject[roomID].round + gamesObject[roomID].first;
    const playersArr = gamesObject[roomID].players;
    const won = gamesObject[roomID].won;
    const gamePlan = gamesObject[roomID].gamePlan;

    if (
      playersArr[round % 2] === socket.id &&
      won === false &&
      gamePlan[xPos][yPos] === 0
    ) {
      clearInterval(gamesObject[roomID].timerDelta);

      gamesObject[roomID].gamePlan[xPos][yPos] = round % 2 ? "1" : "2";

      quickNsp
        .to(roomID)
        .emit(
          "click success",
          socket.id,
          round,
          xPos,
          yPos,
          gamesObject[roomID].times,
          playersArr
        );
      // IMPLEMENT LINES
      if (checkWin(gamesObject[roomID].gamePlan, yPos, xPos, round) != false) {
        quickNsp.to(roomID).emit("win", socket.id);
        gamesObject[roomID].won = true;
      } else {
        gamesObject[roomID].times[Math.abs(round - 1) % 2][1] = Date.now();
        gamesObject[roomID].timerDelta = setInterval(() => {
          if (gamesObject[roomID] && gamesObject[roomID].won !== true) {
            let timeArr = reTime(
              gamesObject[roomID].times[Math.abs(round - 1) % 2][1],
              gamesObject[roomID].times[Math.abs(round - 1) % 2][0],
              gamesObject[roomID].players[round % 2],
              roomID
            );
            gamesObject[roomID].times[Math.abs(round - 1) % 2][0] = timeArr[0];
            gamesObject[roomID].times[Math.abs(round - 1) % 2][1] += timeArr[1];
          }
        }, 1000);
      }

      gamesObject[roomID].round++;
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
    let existingRooms = Object.keys(gamesObject);
    for (let room of existingRooms) {
      if (gamesObject[room].players.includes(socket.id)) {
        if (gamesObject[room].won == null || gamesObject[room].won == false)
          quickNsp.to(room).emit("playerLeft");

        clearInterval(gamesObject[room].timerDelta);
        delete gamesObject[room];
      }
    }
  });
});

function reTime(timeStamp, restSeconds, enemyID, roomID) {
  let deltaTime = Date.now() - timeStamp;
  if (restSeconds - deltaTime / 1000 <= 0) {
    clearInterval(gamesObject[roomID].timerDelta);
    gamesObject[roomID].won = true;
    quickNsp.to(roomID).emit("win", enemyID);
  } else {
    return [restSeconds - deltaTime / 1000, deltaTime];
  }
}

function genID(compareArr) {
  for (let x = 0; x < 100; x++) {
    let randID =
      "_" +
      Math.random()
        .toString(36)
        .substr(2, 9);
    if (!compareArr.hasOwnProperty(randID)) {
      return randID;
    }
  }
}
