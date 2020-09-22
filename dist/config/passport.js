"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const passport_local_1 = __importDefault(require("passport-local"));
const bcryptjs_1 = __importDefault(require("bcryptjs"));
// Load User Model
const User_1 = __importDefault(require("../models/User"));
module.exports = function (passport) {
    passport.use(new passport_local_1.default.Strategy({
        usernameField: "email",
        passwordField: "password",
    }, (username, password, done) => {
        // Match user
        User_1.default.findOne({ email: username })
            .then((user) => {
            if (!user) {
                return done(null, false);
            }
            // Match password
            bcryptjs_1.default.compare(password, user.password, (err, isMatch) => {
                if (err)
                    throw err;
                if (isMatch) {
                    return done(null, user);
                }
                else {
                    return done(null, false);
                }
            });
        })
            .catch((err) => console.log(err));
    }));
    passport.serializeUser(function (user, done) {
        done(null, user.id);
    });
    passport.deserializeUser(function (id, done) {
        User_1.default.findById(id, function (err, user) {
            done(err, user);
            if (err)
                console.log(err);
        });
    });
};
//# sourceMappingURL=passport.js.map