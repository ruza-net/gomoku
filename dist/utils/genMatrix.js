"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
/**
 * Creates n^n fields/matrix
 * @param n - length of matrix
 * @returns Array<Array<number>>
 */
function gen(n) {
    if (n < 0)
        return [];
    let matrix = [];
    for (let x = 0; x < n; x++) {
        matrix.push([]);
        for (let y = 0; y < n; y++) {
            matrix[x].push(0);
        }
    }
    return matrix;
}
exports.default = gen;
//# sourceMappingURL=genMatrix.js.map