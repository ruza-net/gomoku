"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
function jwtAuth(req, res) {
    const token = req.header("auth-token");
    // True if auth-token undefined <== missing auth-token in Request header
    if (!token)
        return res.status(401).send("Access Denied");
    try {
        const verified = jsonwebtoken_1.default.verify(token, process.env.JWTSECRET);
        req.user = verified;
        res.status(200).send(verified);
    }
    catch (err) {
        console.log(err);
        res.send(false);
    }
}
exports.default = jwtAuth;
//# sourceMappingURL=jwtAuth.js.map