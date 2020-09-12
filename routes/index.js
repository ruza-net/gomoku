"use strict";
const express = require("express");
const router = express.Router();
const passport = require("passport");

router.post("/port", function(req, res) {
  // If this function gets called, authentication was successful.
  // `req.user` contains the authenticated user.
  res.status(200).send(String(process.env.PORT || 3000));
});

module.exports = router;
