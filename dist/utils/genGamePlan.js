"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
/**
 * Generating 15*15 matrix
 */
exports.default = () => {
    let gameArray = [];
    for (let x = 0; x < 15; x++) {
        gameArray.push([]);
        for (let y = 0; y < 15; y++) {
            gameArray[x].push(0);
        }
    }
    return gameArray;
};
//# sourceMappingURL=genGamePlan.js.map