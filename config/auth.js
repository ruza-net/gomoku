"use strict";
module.exports = {
  ensureAuthenticated: function(req, res, next) {
    if (req.isAuthenticated()) {
      return next();
    }
    res.redirect("/login");
  },
  checkAuthenticated: function(req, res, next) {
    req.isAuthenticated() ? (res.logged = true) : (res.logged = false);
    return next();
  },
};
