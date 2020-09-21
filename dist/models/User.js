"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.UserSchema = void 0;
const mongoose_1 = __importDefault(require("mongoose"));
var gameBoard;
(function (gameBoard) {
    gameBoard["NORMAL"] = "normal";
    gameBoard["TRADITIONAL"] = "traditional";
    gameBoard["MODERN"] = "modern";
})(gameBoard || (gameBoard = {}));
exports.UserSchema = new mongoose_1.default.Schema({
    username: {
        type: String,
        required: true,
    },
    googleId: {
        type: String,
    },
    email: {
        type: String,
    },
    isVerified: {
        type: Boolean,
        default: false,
    },
    password: {
        type: String,
    },
    date: {
        type: Date,
        default: Date.now,
    },
    colors: {
        enemyColor: {
            type: String,
            default: "#ff2079",
        },
        playerColor: {
            type: String,
            default: "#00b3fe",
        },
    },
    gameBoard: {
        type: String,
        default: "normal",
    },
    elo: {
        type: Number,
        default: 1000,
    },
    totalRankedGames: {
        type: Number,
        default: 0,
    },
    eloHistory: [
        {
            timestamp: {
                type: Date,
                default: Date.now(),
            },
            currElo: {
                type: Number,
            },
        },
    ],
});
const User = mongoose_1.default.model("User", exports.UserSchema);
exports.default = User;
//# sourceMappingURL=User.js.map