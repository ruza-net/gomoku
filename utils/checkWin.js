/**
 * Check if there is winning combination on gameboard
 * @param  {Array} gamePlan matrix representation of gameboard
 * @param  {yPos} row row of placed stone (0-14)
 * @param  {xPos} column column of placed stone (0-14)
 * @param  {Number} round current round (0-255)
 * @return {(String|Boolean)} returns "won" | "tie" | false
 */
function checkWin(gamePlan, yPos, xPos, round) {
  const tile = round % 2 ? "1" : "2";
  let horizont = 0;
  let vertical = 0;
  let diagonalR = 0;
  let diagonalL = 0;
  for (let x = -4; x < 5; x++) {
    // * Horizontal check

    if (xPos + x >= 0 && xPos + x <= 14) {
      if (gamePlan[xPos + x][yPos] === tile) {
        horizont++;
      } else {
        horizont = 0;
      }
    }

    if (yPos + x >= 0 && yPos + x <= 14) {
      if (gamePlan[xPos][yPos + x] === tile) {
        vertical++;
      } else {
        vertical = 0;
      }
    }

    if (yPos + x >= 0 && yPos + x <= 14 && xPos + x >= 0 && xPos + x <= 14) {
      if (gamePlan[xPos + x][yPos + x] === tile) {
        diagonalR++;
      } else {
        diagonalR = 0;
      }
    }

    if (yPos + x >= 0 && yPos + x <= 14 && xPos - x >= 0 && xPos - x <= 14) {
      if (gamePlan[xPos - x][yPos + x] === tile) {
        diagonalL++;
      } else {
        diagonalL = 0;
      }
    }
    if (horizont >= 5 || vertical >= 5 || diagonalL >= 5 || diagonalR >= 5) {
      return "win";
    }
  }

  if (horizont >= 5 || vertical >= 5 || diagonalL >= 5 || diagonalR >= 5) {
    return "win";
  } else if (round === 225) {
    return "tie";
  } else {
    return false;
  }
}

module.exports = checkWin;
