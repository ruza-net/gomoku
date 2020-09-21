"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
// ? IN DEVELOP LOAD CONFIG >> MONGODB KEY
if (process.env.NODE_ENV !== "production") {
    require("dotenv/config");
}
// * IMPORTS
// ? EXPRESS
const express_1 = __importDefault(require("express"));
const app = express_1.default();
const compression_1 = __importDefault(require("compression"));
const cors_1 = __importDefault(require("cors"));
// ? MONGOOSE
const mongoose_1 = __importDefault(require("mongoose"));
// ? PASSPORT and SESSION
const passport_1 = __importDefault(require("passport"));
// import session from "cookie-session";
// ? SOCKET.IO + HTTP
const socket_io_1 = __importDefault(require("socket.io"));
const http_1 = __importDefault(require("http"));
// ? PASSPORT CONFIG
require("./config/passport")(passport_1.default);
// ? EXPRESS BODYPARSER
app.use(express_1.default.json()); // to support JSON-encoded bodies
app.use(express_1.default.urlencoded({ extended: true })); // to support URL-encoded bodies
app.use(cors_1.default());
// ? EXPRESS SESSION
// app.use(
//   session({
//     keys: [process.env.COOKIE_SECRET as string],
//     expires: new Date(253402300000000),
//   })
// );
// ? PASSPORT MIDDLEWARE
app.use(passport_1.default.initialize());
// app.use(passport.session());
// ? ROUTES
const api_1 = require("./routes/api");
const index_1 = require("./routes/index");
app.use("/api/", api_1.apiRouter);
app.use("/", index_1.indexRouter);
app.use(compression_1.default());
if (process.env.NODE_ENV === "production" || true) {
    //Static folder
    app.use(express_1.default.static(__dirname + "/public/"));
    // Handle SPA
    app.get(/.*/, (req, res) => res.sendFile(__dirname + "/public/index.html"));
}
// ? MongoDB Constructor and URL parser deprecation warning fix
mongoose_1.default.set("useUnifiedTopology", true);
mongoose_1.default.set("useNewUrlParser", true);
mongoose_1.default.set("useFindAndModify", false);
// ? DB connection
mongoose_1.default.connect(process.env.DB_CONNECTION);
const db = mongoose_1.default.connection;
db.on("error", (err) => console.error(err));
db.once("open", () => console.log("Connected to Mongoose"));
const PORT = process.env.PORT || 3000;
const server = new http_1.default.Server(app);
// utils functions import
const genUniqueID_1 = __importDefault(require("./utils/genUniqueID"));
const genMatrix_1 = __importDefault(require("./utils/genMatrix"));
const socketUtilFuncs_1 = require("./utils/socketUtilFuncs");
const io = socket_io_1.default(server);
server.listen(PORT);
// FIXME Fix the ranked que coercition and non-null assertion operators
const gameMode = {
    quick: {
        que: [],
        games: {},
    },
    private: {
        games: {},
    },
    ranked: {
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
searchNsp.on("connection", function (socket) {
    gameMode.quick.que.push(socket.id);
    if (gameMode.quick.que.length >= 2) {
        let roomID = genUniqueID_1.default(gameMode.quick.games, 7);
        gameMode.quick.games[roomID] = {
            players: [],
            nicks: {},
            first: 0,
            round: 0,
            isTimed: true,
            intervalLink: null,
            times: [
                { timeLeft: 150, timeStamp: Date.now() },
                { timeLeft: 150, timeStamp: Date.now() },
            ],
            won: null,
            gamePlan: genMatrix_1.default(15),
        };
        searchNsp.to(gameMode.quick.que[0]).emit("gameCreated", roomID);
        searchNsp.to(gameMode.quick.que[1]).emit("gameCreated", roomID);
        gameMode.quick.que.splice(0, 2);
    }
    socket.on("disconnect", function () {
        if (gameMode.quick.que.includes(socket.id)) {
            let indexOfSocket = gameMode.quick.que.indexOf(socket.id);
            gameMode.quick.que.splice(indexOfSocket, 1);
        }
    });
});
quickNsp.on("connection", function (socket) {
    let games = gameMode.quick.games;
    socket.on("gameJoined", function (roomID, username) {
        socketUtilFuncs_1.startGame(games, roomID, username, quickNsp, socket);
    });
    socket.on("game click", function (roomID, xPos, yPos) {
        socketUtilFuncs_1.gameClick(games, roomID, xPos, yPos, false, quickNsp, socket);
    });
    socket.on("disconnect", function () {
        socketUtilFuncs_1.playerDisconnected(games, false, quickNsp, socket);
    });
});
// Private
waitingRoomNsp.on("connection", function (socket, username) {
    socket.on("createRoom", function (timeInMinutes) {
        let roomID = genUniqueID_1.default(gameMode.private.games, 4);
        const isTimed = timeInMinutes !== null;
        gameMode.private.games[roomID] = {
            players: [],
            nicks: {},
            first: 0,
            round: 0,
            isTimed: isTimed,
            times: [
                { timeLeft: timeInMinutes * 60, timeStamp: Date.now() },
                { timeLeft: timeInMinutes * 60, timeStamp: Date.now() },
            ],
            won: null,
            gamePlan: genMatrix_1.default(15),
        };
        socket.join(roomID);
        socket.emit("roomGenerated", roomID);
    });
    socket.on("roomJoined", function (roomID) {
        if (gameMode.private.games.hasOwnProperty(roomID)) {
            socket.join(roomID);
            gameMode.private.games[roomID].won = false;
            waitingRoomNsp
                .to(roomID)
                .emit("gameBegun", roomID, gameMode.private.games[roomID].times[0].timeLeft);
        }
        else {
            socket.emit("room invalid");
        }
    });
    socket.on("disconnect", function () {
        let existingRooms = Object.keys(gameMode.private.games);
        for (let room of existingRooms) {
            if (gameMode.private.games[room].players.includes(socket.id)) {
                if (gameMode.private.games[room].won === null)
                    delete gameMode.private.games[room];
            }
        }
    });
});
privateGameNsp.on("connection", function (socket) {
    socket.on("gameJoined", function (roomID, username) {
        socketUtilFuncs_1.startGame(gameMode.private.games, roomID, username, privateGameNsp, socket);
    });
    socket.on("game click", function (roomID, xPos, yPos) {
        socketUtilFuncs_1.gameClick(gameMode.private.games, roomID, xPos, yPos, false, privateGameNsp, socket);
    });
    socket.on("disconnect", function () {
        socketUtilFuncs_1.playerDisconnected(gameMode.private.games, false, privateGameNsp, socket);
    });
});
// Ranked
rankedSearchNsp.on("connection", function (socket) {
    socket.on("beginSearch", function (username) {
        // Assign Elo
        socketUtilFuncs_1.getUserElo(username, (err, elo) => {
            if (err)
                console.log(err);
            gameMode.ranked.que.push({ id: socket.id, elo, username });
            if (gameMode.ranked.que.length >= 2) {
                let roomID = genUniqueID_1.default(gameMode.ranked.games, 7);
                gameMode.ranked.games[roomID] = {
                    players: [],
                    nicks: {},
                    elo: {
                        [gameMode.ranked.que[0].username]: gameMode.ranked.que[0].elo,
                        [gameMode.ranked.que[1].username]: gameMode.ranked.que[1].elo,
                    },
                    first: 0,
                    round: 0,
                    intervalLink: null,
                    isTimed: true,
                    times: [
                        { timeLeft: 150, timeStamp: Date.now() },
                        { timeLeft: 150, timeStamp: Date.now() },
                    ],
                    won: null,
                    gamePlan: genMatrix_1.default(15),
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
    socket.on("disconnect", function () {
        for (let queMember of gameMode.ranked.que) {
            if (queMember.id === socket.id) {
                let indexOfSocket = gameMode.ranked.que.indexOf(queMember);
                gameMode.ranked.que.splice(indexOfSocket, 1);
            }
        }
    });
});
rankedNsp.on("connection", function (socket) {
    let games = gameMode.ranked.games;
    socket.on("gameJoined", function (roomID, username) {
        socketUtilFuncs_1.startGame(games, roomID, username, rankedNsp, socket);
    });
    socket.on("game click", function (roomID, xPos, yPos) {
        socketUtilFuncs_1.gameClick(games, roomID, xPos, yPos, true, rankedNsp, socket);
    });
    socket.on("disconnect", function () {
        socketUtilFuncs_1.playerDisconnected(games, true, rankedNsp, socket);
    });
});
//# sourceMappingURL=server.js.map