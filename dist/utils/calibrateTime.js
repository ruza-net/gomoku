"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
/**
 * Calibrate local time to server time, called on click and after timeOut
 * @param {Object} games Object containing games of certain namespace/type
 * @param {Object} namespace Socket.io namespace
 * @param {String} roomID id of current room/game
 */
// FIXME Games object
function calibrateTime(games, roomID, namespace) {
    if (games[roomID]) {
        let currPlayerIx = (games[roomID].first + games[roomID].round) % 2;
        let game = games[roomID];
        let timeStamp = game.times[currPlayerIx].timeStamp;
        let restSeconds = game.times[currPlayerIx].timeLeft;
        let deltaTime = Date.now() - timeStamp;
        // TIME is out
        if (restSeconds - deltaTime / 1000 <= 0) {
            clearInterval(games[roomID].timerDelta);
            games[roomID].won = true;
            let enemyID = game.players[(currPlayerIx + 1) % 2];
            namespace.to(roomID).emit("win", enemyID);
        }
        else {
            return restSeconds - deltaTime / 1000;
        }
    }
    throw new Error("Calibrate time has failed");
    return 0;
}
exports.default = calibrateTime;
//# sourceMappingURL=calibrateTime.js.map