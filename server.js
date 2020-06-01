"user strict"
// ? IN DEVELOP LOAD CONFIG >> MONGODB KEY
if (process.env.NODE_ENV !== 'production') {
  require('dotenv/config');
}

// * IMPORTS
// ? EXPRESS
const express = require("express");
const app = express();
const compression = require('compression');
// ? MONGOOSE
const mongoose = require('mongoose');
// ? PASSPORT and SESSION
const passport = require("passport");
const session = require("express-session");
const cors = require("cors");
// ? SOCKET.IO + HTTP
const socketIO = require("socket.io");
const http = require("http");


// ? PASSPORT CONFIG
require('./config/passport')(passport);

// CORS middleware
const allowCrossDomain = function (req, res, next) {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', '*');
  res.header('Access-Control-Allow-Headers', '*');
  next();
}

// app.use(allowCrossDomain);
app.use(cors);
// ? EXPRESS BODYPARSER
app.use(express.json());       // to support JSON-encoded bodies
app.use(express.urlencoded({ extended: true })); // to support URL-encoded bodies

// ? EXPRESS SESSION
app.use(
  session({
    secret: 'secret',
    resave: true,
    saveUninitialized: true,
    cookie: { expires: new Date(253402300000000) }
  })
);

// ? PASSPORT MIDDLEWARE
app.use(passport.initialize());
app.use(passport.session());

// ? ROUTES
const indexRouter = require("./routes/index");
app.use("/api/", indexRouter);

app.use(compression());
if (process.env.NODE_ENV === "production") {
  //Static folder
  app.use(express.static(__dirname + "/public/"));

  // Handle SPA

  app.get(/.*/, (req, res) => res.sendFile(__dirname + "/public/index.html"));
}

// ? MongoDB Constructor and URL parser deprecation warning fix
mongoose.set('useUnifiedTopology', true);
mongoose.set('useNewUrlParser', true);
mongoose.set('useFindAndModify', false);

// ? DB connection
mongoose.connect(process.env.DB_CONNECTION);
const db = mongoose.connection;

db.on("error", error => console.error(error));
db.once("open", () => console.log("Connected to Mongoose"));

const PORT = 3000;

const server = http.Server(app);

server.listen(PORT);

const gamesObject = {};

const io = socketIO(server, { origins: '*:*', cookie: false });
const playersQue = [];

const gamePlan = () => {
  let gameArray = []
  for (let x = 0; x < 15; x++) {
    gameArray.push([]);
    for (let y = 0; y < 15; y++) {
      gameArray[x].push(0);
    }
  }
  return gameArray;
};

// ? Managing Socket.IO instances
io.on('connect', function (socket) {
  // ? Give client set of existing rooms
  playersQue.push(socket.id);
  if (playersQue.length >= 2) {
    let roomID = genID(gamesObject);
    gamesObject[roomID] = {
      players: [],
      first: null,
      round: 0,
      time0: 300,
      time1: 300,
      timestamp: null,
      won: true,
      gamePlan: gamePlan()
    };

    io.to(playersQue[0]).emit('gameCreated', roomID);
    io.to(playersQue[1]).emit('gameCreated', roomID);

    playersQue.splice(0, 2);
  }

  socket.on("gameJoined", function (roomID) {
    if (!gamesObject.hasOwnProperty(roomID)) {
      socket.emit("roomMissing");
    } else {
      socket.join(roomID);
      gamesObject[roomID].players.push(socket.id);
      if (gamesObject[roomID].players.length >= 2) {
        let rndN = Math.round(Math.random());
        gamesObject[roomID].first = rndN;
        io.to(roomID).emit("gameBegun", gamesObject[roomID].players[rndN]);
        setTimeout(() => {
          io.to(roomID).emit("startTimer", gamesObject[roomID].players[rndN]);
          gamesObject[roomID].won = false;
        }, 3000)
      }
    }
  });

  socket.on("gameClick", function (row, column) {

  });

  socket.on("game click", function (roomID, xPos, yPos) {
    const round = gamesObject[roomID].round;
    const playersArr = gamesObject[roomID].players;
    const won = gamesObject[roomID].won;
    const gamePlan = gamesObject[roomID].gamePlan;

    if (playersArr[round % 2] === socket.id && !won && gamePlan[xPos][yPos] === 0) {
      // check if valid

      gamesObject[roomID].gamePlan[xPos][yPos] = (round % 2) ? "1" : "2";

      gamesObject[roomID].round++;

      io.to(roomID).emit('click success', socket.id, round, xPos, yPos);

      // Check if won
      // if (checkWin(gamePlan, data.id, round, playersArr)) {
      //   runningGames[roomID].won = true;
      //   io.to(roomID).emit("won", checkWin(gamePlan, data.id, round, playersArr), round);
      // }

    } else {
    }

    function checkWin(gamePlan, lastPos, round, playersArr) {
      const tile = (round % 2) ? "1" : "2";
      const yPos = +lastPos.split(":")[0];
      const xPos = +lastPos.split(":")[1];

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

        if (yPos + x >= 0 && yPos + x <= 14 && xPos + x >= 0 && xPos + x <= 14) {
          if (gamePlan[xPos + x][yPos + x] === tile) {
            diagonalR++;
          } else {
            diagonalR = 0;
          }
        }

        if (yPos + x >= 0 && yPos + x <= 14 && xPos - x >= 0 && xPos - x <= 14) {
          if (gamePlan[xPos - x][yPos + x] === tile) {
            diagonalL++;
          } else {
            diagonalL = 0;
          }
        }
        if (horizont >= 5 || vertical >= 5 || diagonalL >= 5 || diagonalR >= 5) {
          return (playersArr[round % 2] + " has won");
        }
      }

      if (horizont >= 5 || vertical >= 5 || diagonalL >= 5 || diagonalR >= 5) {
        return (playersArr[round % 2] + " has won");
      } else if (round === 225) {
        return "tie";
      } else {
        return false;
      }

    }
  });

  socket.on('disconnect', function () {
    let indexOfSocket = playersQue.indexOf(socket.id);
    playersQue.splice(indexOfSocket, 1);
  })
});

function genID(compareArr) {
  for (let x = 0; x < 100; x++) {
    let randID = '_' + Math.random().toString(36).substr(2, 9);
    if (!(compareArr.hasOwnProperty(randID))) {
      return randID;
    }
  }
};
