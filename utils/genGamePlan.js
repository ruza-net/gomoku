/**
 * Generating 15*15 matrix
 */
module.exports = () => {
  let gameArray = [];
  for (let x = 0; x < 15; x++) {
    gameArray.push([]);
    for (let y = 0; y < 15; y++) {
      gameArray[x].push(0);
    }
  }
  return gameArray;
};
