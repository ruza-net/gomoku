"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
/**
 * Generates random string of given length and compare it simple shallow object
 * @param {Object} compareObject object to compare to
 * @param {Number} length Length of output string
 * @returns {String}
 */
// FIXME Add safety instead of empty string...
function genID(compareObject, length) {
    if (length <= 0)
        return "";
    for (let x = 0; x < 100; x++) {
        let randID = Math.random()
            .toString(36)
            .substr(2, length)
            .toUpperCase();
        if (!compareObject.hasOwnProperty(randID)) {
            return randID;
        }
    }
    return "";
}
exports.default = genID;
//# sourceMappingURL=genUniqueID.js.map