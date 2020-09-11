"use strict";
const LocalStrategy = require("passport-local").Strategy;
const GoogleStrategy = require("passport-google-oauth20").Strategy;
const bcrypt = require("bcryptjs");

// Load User Model
const User = require("../models/User");

module.exports = function(passport) {
  passport.use(
    new LocalStrategy(
      {
        usernameField: "email",
        passwordField: "password",
      },
      (username, password, done) => {
        // Match user

        User.findOne({ email: username })
          .then((user) => {
            if (!user) {
              return done(null, false);
            }
            // Match password

            bcrypt.compare(password, user.password, (err, isMatch) => {
              if (err) throw err;

              if (isMatch) {
                return done(null, user);
              } else {
                return done(null, false);
              }
            });
          })
          .catch((err) => console.log(err));
      }
    )
  );

  // Use the GoogleStrategy within Passport.
  //   Strategies in Passport require a `verify` function, which accept
  //   credentials (in this case, an accessToken, refreshToken, and Google
  //   profile), and invoke a callback with a user object.
  passport.use(
    new GoogleStrategy(
      {
        clientID: process.env.GOOGLE_CLIENT_ID,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET,
        callbackURL: "/auth/google/redirect",
        passReqToCallback: true,
      },
      (accessToken, refreshToken, profile, done) => {
        console.log("tried");
        User.findOrCreate({ googleId: profile.id }, function(err, user) {
          if (err) throw err;
          console.log("User: ", user);
          return done(err, user);
        });
      }
    )
  );

  passport.serializeUser(function(user, done) {
    done(null, user.id);
  });

  passport.deserializeUser(function(id, done) {
    User.findById(id, function(err, user) {
      done(err, user);
      if (err) console.log(err);
    });
  });
};
