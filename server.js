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
const cors = require("cors");

// ? MONGOOSE
const mongoose = require("mongoose");

// ? PASSPORT and SESSION
const passport = require("passport");
const session = require("cookie-session");

// ? SOCKET.IO + HTTP
const socketIO = require("socket.io");
const http = require("http");

// ? PASSPORT CONFIG
require("./config/passport")(passport);

// ? EXPRESS BODYPARSER
app.use(express.json()); // to support JSON-encoded bodies
app.use(express.urlencoded({ extended: true })); // to support URL-encoded bodies
app.use(cors());

// ? EXPRESS SESSION
app.use(
  session({
    keys: [process.env.COOKIE_SECRET],
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

// utils functions import
const genID = require("./utils/genUniqueID");
const gamePlan = require("./utils/genGamePlan");

const { isNull } = require("util");
const {
  getUserElo,
  startGame,
  gameClick,
  playerDisconnected,
} = require("./utils/socketUtilFuncs");

const io = socketIO(server);
server.listen(PORT);

const gameMode = {
  quick: {
    que: [],
    games: {},
  },
  private: {
    games: {},
  },
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

// Quick
searchNsp.on("connection", function(socket) {
  gameMode.quick.que.push(socket.id);
  if (gameMode.quick.que.length >= 2) {
    let roomID = genID(gameMode.quick.games, 7);
    gameMode.quick.games[roomID] = {
      players: [],
      nicks: {},
      first: null,
      round: 0,
      isTimed: true,
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

// Private
waitingRoomNsp.on("connection", function(socket, username) {
  socket.on("createRoom", function(timeInMinutes) {
    let roomID = genID(gameMode.private.games, 4);

    const isTimed = !isNull(timeInMinutes);

    gameMode.private.games[roomID] = {
      players: [],
      nicks: {},
      first: null,
      round: 0,
      isTimed: isTimed,
      times: [
        { timeLeft: timeInMinutes * 60, timeStamp: Date.now() },
        { timeLeft: timeInMinutes * 60, timeStamp: Date.now() },
      ],
      won: null,
      gamePlan: gamePlan(),
    };

    socket.join(roomID);
    socket.emit("roomGenerated", roomID);
  });
  socket.on("roomJoined", function(roomID) {
    if (gameMode.private.games.hasOwnProperty(roomID)) {
      socket.join(roomID);

      gameMode.private.games[roomID].won = false;
      waitingRoomNsp
        .to(roomID)
        .emit(
          "gameBegun",
          roomID,
          gameMode.private.games[roomID].times[0].timeLeft
        );
    } else {
      socket.emit("room invalid");
    }
  });
  socket.on("disconnect", function() {
    let existingRooms = Object.keys(gameMode.private.games);
    for (let room of existingRooms) {
      if (gameMode.private.games[room].players.includes(socket.id)) {
        if (gameMode.private.games[room].won === null)
          delete gameMode.private.games[room];
      }
    }
  });
});

privateGameNsp.on("connection", function(socket) {
  socket.on("gameJoined", function(roomID, username) {
    startGame(gameMode.private.games, roomID, username, privateGameNsp, socket);
  });

  socket.on("game click", function(roomID, xPos, yPos) {
    gameClick(
      gameMode.private.games,
      roomID,
      xPos,
      yPos,
      false,
      privateGameNsp,
      socket
    );
  });

  socket.on("disconnect", function() {
    playerDisconnected(gameMode.private.games, false, privateGameNsp, socket);
  });
});

// Ranked
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
          isTimed: true,
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
