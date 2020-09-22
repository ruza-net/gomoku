"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.playerDisconnected = exports.gameClick = exports.calcAndUpdateELO = exports.startGame = exports.updateElo = exports.getUserElo = void 0;
const calibrateTime_1 = __importDefault(require("./calibrateTime"));
const checkWin_1 = __importDefault(require("./checkWin"));
const User_1 = __importDefault(require("../models/User"));
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
                }
                else {
                    namespace.to(room).emit("playerLeft");
                }
            }
            clearInterval(games[room].intervalLink);
            delete games[room];
        }
    }
}
exports.playerDisconnected = playerDisconnected;
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
    if (game) {
        const round = game.round + game.first;
        if (game.players[round % 2] === socket.id &&
            game.won === false &&
            game.gamePlan[xPos][yPos] === 0) {
            clearInterval(game.intervalLink);
            game.gamePlan[xPos][yPos] = round % 2 ? 1 : 2;
            namespace
                .to(roomID)
                .emit("click success", socket.id, round, xPos, yPos, game.times, game.players);
            let gameState;
            (function (gameState) {
                gameState["WIN"] = "win";
                gameState["TIE"] = "tie";
                gameState["CONTINUE"] = "continue";
            })(gameState || (gameState = {}));
            const gameBoardState = checkWin_1.default(game.gamePlan, yPos, xPos, round);
            if (gameBoardState !== gameState.CONTINUE) {
                if (gameBoardState === gameState.WIN) {
                    if (rated) {
                        calcAndUpdateELO(game, gameState.WIN, socket, (eloDiff) => {
                            namespace.to(roomID).emit(gameState.WIN, socket.id, eloDiff);
                        });
                    }
                    else {
                        namespace.to(roomID).emit(gameState.WIN, socket.id);
                    }
                }
                else if (gameBoardState === gameState.TIE) {
                    if (rated) {
                        calcAndUpdateELO(game, gameState.TIE, socket, (eloDiff, tieGainerID) => {
                            namespace.to(roomID).emit(gameState.TIE, eloDiff, tieGainerID);
                        });
                    }
                    else {
                        namespace.to(roomID).emit(gameState.TIE);
                    }
                }
                game.won = true;
            }
            else {
                if (game.isTimed) {
                    game.times[Math.abs(round - 1) % 2].timeStamp = Date.now();
                    game.intervalLink = setInterval(() => {
                        if (game && game.won !== true) {
                            let calibratedTime = calibrateTime_1.default(games, roomID, namespace);
                            game.times[Math.abs(round - 1) % 2].timeLeft = calibratedTime;
                            game.times[Math.abs(round - 1) % 2].timeStamp = Date.now();
                        }
                    }, 1000);
                }
            }
            game.round++;
        }
    }
}
exports.gameClick = gameClick;
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
    }
    else if (gameEnding === "tie") {
        const S1 = 0.5;
        const S2 = 0.5;
        finalELO1 = oldELO1 + K * (S1 - E1);
        finalELO2 = oldELO2 + K * (S2 - E2);
        const eloDiff = Math.abs(oldELO1 - finalELO1);
        const tieGainerID = oldELO1 < finalELO1 ? id1 : id2;
        callback(eloDiff, tieGainerID);
    }
    else if (gameEnding === "left") {
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
exports.calcAndUpdateELO = calcAndUpdateELO;
/**
 * Finds game created in search (if not then send 404), picks random first player and sets time interval
 * @param {Object} games existing games from certain gameType
 * @param {String} roomID
 * @param {String} username
 * @param {Namespace} namespace socket.io namespace (e.g rankedNsp, quickNsp)
 * @param {Socket} socket socket.io instance
 */
function startGame(games, roomID, username, namespace, socket) {
    // Check if room exists, otherwise send to 404
    if (!games.hasOwnProperty(roomID)) {
        socket.emit("roomMissing");
    }
    else {
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
            if (game.isTimed) {
                game.times[rndN].timeStamp = Date.now();
                game.intervalLink = setInterval(() => {
                    if (game) {
                        if (game.won !== true) {
                            let calibratedTime = calibrateTime_1.default(games, roomID, namespace);
                            game.times[rndN].timeLeft = calibratedTime;
                            game.times[rndN].timeStamp = Date.now();
                        }
                    }
                }, 1000);
            }
            setTimeout(() => {
                if (games[roomID]) {
                    games[roomID].won = false;
                }
            }, 3000);
        }
    }
}
exports.startGame = startGame;
/**
 *
 * @param {String} username
 * @param {Number} newElo
 * @return {Boolean} true\false
 */
// TODO Move to promise based function
function updateElo(username, newElo) {
    User_1.default.findOneAndUpdate({ username }, { elo: newElo })
        .then(() => { })
        .catch((err) => {
        console.log(err);
    });
}
exports.updateElo = updateElo;
/**
 *
 * @param {String} username
 * @param {Function} callback
 * @return {Number} Elo
 */
// TODO Move to promise based functoin
// TODO Mongoose user type Document <= any
function getUserElo(username, callback) {
    User_1.default.findOne({ username: username }).then((user) => {
        if (user) {
            callback(null, user.elo);
        }
        else {
            const err = new Error("User does not exist");
            callback(err, null);
        }
    });
}
exports.getUserElo = getUserElo;
//# sourceMappingURL=socketUtilFuncs.js.map