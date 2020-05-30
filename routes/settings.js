"use strict";
const express = require("express");
const router = express.Router();
const { ensureAuthenticated, checkAuthenticated } = require("../config/auth");

//* Default settings *//
router.get("/", checkAuthenticated, (req, res) => {
  let username;
  if (req.user) {
    username = req.user.username;
  } else {
    username = "Guest";
  }

  res.render("settings", {
    active_page: "",
    logged: res.logged,
    username: username,
  });
});

module.exports = router;