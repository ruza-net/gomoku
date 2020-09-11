"use strict";
const express = require("express");
const router = express.Router();
const passport = require("passport");

router.get(
  "/auth/google",
  passport.authenticate("google", {
    scope: ["profile", "email"],
  })
);
router.get(
  "/auth/google/redirect",
  passport.authenticate("google", {
    successRedirect: "/succ",
    failureRedirect: "/fail",
  })
);
router.post("/port", function(req, res) {
  // If this function gets called, authentication was successful.
  // `req.user` contains the authenticated user.
  res.status(200).send(String(process.env.PORT || 3000));
});

module.exports = router;
