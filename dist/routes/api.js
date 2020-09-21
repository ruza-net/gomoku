"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.apiRouter = void 0;
const express_1 = __importDefault(require("express"));
const router = express_1.default.Router();
exports.apiRouter = router;
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const passport_1 = __importDefault(require("passport"));
const nodemailer_1 = __importDefault(require("nodemailer"));
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const jwtAuth_1 = __importDefault(require("../config/jwtAuth"));
const User_1 = __importDefault(require("../models/User"));
router.post("/register", (req, res) => {
    const { username, email, password, password2, } = req.body;
    let errors = [];
    // Check required fields
    if (!username || !email || !password || !password2) {
        errors.push({ msg: "Please fill in all the fields" });
    }
    // Check password match
    if (password !== password2) {
        errors.push({ msg: "Passwords don't match" });
    }
    // Check password strength
    if (password.length < 3) {
        errors.push({ msg: "Password must be longer" });
    }
    if (errors.length > 0) {
        console.log(errors);
        res.status(403).send(errors[0].msg);
    }
    else {
        // Validation passed
        User_1.default.findOne({ username: username }).then((user) => {
            if (user) {
                res.status(403).send("Username is already taken");
            }
            else {
                User_1.default.findOne({ email: email }).then((userEmail) => {
                    if (userEmail) {
                        res.status(403).send("Email is already taken");
                    }
                    else {
                        // Hash Password
                        bcryptjs_1.default.genSalt(10, (err, salt) => {
                            if (err)
                                throw err;
                            bcryptjs_1.default.hash(password, salt, (err, hash) => {
                                if (err)
                                    throw err;
                                // Set password to hashed
                                const newUser = new User_1.default({
                                    username,
                                    email,
                                    password: hash,
                                });
                                // Save user
                                newUser
                                    .save()
                                    .then((user) => {
                                    res.status(200).send("Successfully registered");
                                })
                                    .catch((err) => console.log(err));
                            });
                        });
                    }
                });
            }
        });
    }
});
router.post("/login", passport_1.default.authenticate("local", { session: true }), function (req, res) {
    // If this function gets called, authentication was successful.
    // `req.user` contains the authenticated user.
    res.status(200).send("");
});
router.post("/googleLogin", (req, res) => {
    const { email } = req.body;
    User_1.default.findOne({ email: email }).then((user) => {
        if (user) {
            let token = jsonwebtoken_1.default.sign({ __id: user.id, username: user.username }, process.env.JWTSECRET);
            res
                .header("auth-token", token)
                .status(200)
                .send({ registered: true, username: user.username });
        }
        else {
            res.status(200).send({ registered: false, username: undefined });
        }
    });
});
router.post("/googleRegister", (req, res) => {
    const { email, username } = req.body;
    User_1.default.findOne({ username: username }).then((user) => {
        if (user) {
            res.status(403).send("Username taken");
        }
        else {
            const newUser = new User_1.default({ username, email });
            newUser
                .save()
                .then(() => {
                res.status(200).send("Successfully registered");
            })
                .catch((err) => console.log(err));
        }
    });
});
router.post("/islogged", (req, res) => {
    if (req.user) {
        res.status(200).send(req.user);
    }
    else {
        // not logged in with local
        jwtAuth_1.default(req, res);
    }
});
router.post("/logout", (req, res) => {
    req.logout();
    res.status(200).send("Logged out");
});
router.post("/contact", (req, res) => {
    const { nickname, email, message, } = req.body;
    if (!nickname || !email || !message) {
        res.status(403).send("Please fill in all the fields");
    }
    else {
        const transporter = nodemailer_1.default.createTransport({
            host: "smtp.zoho.eu",
            port: 465,
            secure: true,
            auth: {
                user: "admin@playgomoku.com ",
                pass: "REtkBLViPj2QCVU",
            },
        });
        const mailOptions = {
            from: "admin@playgomoku.com",
            to: "admin@playgomoku.com",
            subject: `${nickname}`,
            text: `${message}`,
            replyTo: `${email}`,
        };
        transporter.sendMail(mailOptions, function (err, info) {
            if (err) {
                console.log(err);
                res.status(500).send("Unexpected problem");
            }
            else {
                res.status(200).send("Message sent");
            }
        });
    }
});
router.post("/changepassword", (req, res) => {
    const { username, password, password2, } = req.body;
    let errors = [];
    // Check required fields
    if (!password || !password2) {
        errors.push({ msg: "Please fill in all the fields" });
    }
    // Check password match
    if (password !== password2) {
        errors.push({ msg: "Passwords don't match" });
    }
    // Check password strength
    if (password.length < 8) {
        errors.push({ msg: "Password is shorter than 8 characters" });
    }
    if (errors.length > 0) {
        res.render("settings", {
            active_page: "",
            logged: false,
            errors,
            username,
            password,
            password2,
        });
    }
    else {
        // * Hashing password
        bcryptjs_1.default.genSalt(10, (err, salt) => bcryptjs_1.default.hash(password, salt, (err, hash) => {
            let updatePass = User_1.default.findOneAndUpdate({ username: username }, { password: hash }).then(function () {
                res.status(200).send("Password changed");
            });
        }));
    }
});
//# sourceMappingURL=api.js.map