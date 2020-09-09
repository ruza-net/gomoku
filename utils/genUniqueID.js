/**
 * Generates random string of given length and compare it simple shallow object
 * @param {Object} compareObject object to compare to
 * @param {Number} length Length of output string
 * @returns {String}
 */
function genID(compareObject, length) {
  if (length <= 0) return false;
  for (let x = 0; x < 100; x++) {
    let randID = Math.random()
      .toString(36)
      .substr(2, length)
      .toUpperCase();
    if (!compareObject.hasOwnProperty(randID)) {
      return randID;
    }
  }
}

module.exports = genID;
