const jwt = require("jsonwebtoken");

module.exports = function jwtAuth(req, res) {
  const token = req.header("auth-token");
  if (!token) return res.status(401).send("Access Denied");

  try {
    const verified = jwt.verify(token, process.env.JWTSECRET);
    req.user = verified;
    res.status(200).send(verified);
  } catch (err) {
    res.send(false);
  }
};
