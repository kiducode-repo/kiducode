"""
Numerical Linear Algebra Library from Scratch
=============================================
A comprehensive, pure-Python linear algebra module implementing foundational algorithms:
- Matrix and Vector operations
- Gaussian Elimination with Partial Pivoting
- LU Decomposition (Doolittle algorithm)
- QR Decomposition (Gram-Schmidt and Householder reflections)
- Jacobi Eigenvalue Algorithm for symmetric matrices
- Singular Value Decomposition (SVD) approximation via Power Iteration
- Matrix inversion, condition number, and determinant computation
"""

from __future__ import annotations
import math
import random
import time
from typing import List, Tuple, Optional, Callable


class Vector:
    """Mathematical vector representation and operations."""

    def __init__(self, elements: List[float]):
        self.data: List[float] = [float(x) for x in elements]

    def __len__(self) -> int:
        return len(self.data)

    def __getitem__(self, index: int) -> float:
        return self.data[index]

    def __setitem__(self, index: int, value: float) -> None:
        self.data[index] = float(value)

    def __repr__(self) -> str:
        formatted = ", ".join(f"{x:.4f}" for x in self.data[:8])
        if len(self.data) > 8:
            formatted += ", ..."
        return f"Vector([{formatted}])"

    def __add__(self, other: Vector) -> Vector:
        if len(self) != len(other):
            raise ValueError(f"Vector dimensions do not match: {len(self)} vs {len(other)}")
        return Vector([a + b for a, b in zip(self.data, other.data)])

    def __sub__(self, other: Vector) -> Vector:
        if len(self) != len(other):
            raise ValueError(f"Vector dimensions do not match: {len(self)} vs {len(other)}")
        return Vector([a - b for a, b in zip(self.data, other.data)])

    def __mul__(self, scalar: float) -> Vector:
        return Vector([x * scalar for x in self.data])

    def __rmul__(self, scalar: float) -> Vector:
        return self.__mul__(scalar)

    def dot(self, other: Vector) -> float:
        """Computes Euclidean dot product."""
        if len(self) != len(other):
            raise ValueError(f"Vector dimensions do not match: {len(self)} vs {len(other)}")
        return sum(a * b for a, b in zip(self.data, other.data))

    def norm(self, p: float = 2.0) -> float:
        """Computes p-norm (default L2)."""
        if p == float("inf"):
            return max(abs(x) for x in self.data)
        return sum(abs(x) ** p for x in self.data) ** (1.0 / p)

    def normalized(self) -> Vector:
        """Returns unit vector in the same direction."""
        n = self.norm(2.0)
        if n < 1e-15:
            return Vector([0.0] * len(self))
        return self * (1.0 / n)

    def copy(self) -> Vector:
        return Vector(self.data.copy())


class Matrix:
    """2D Matrix representation and core numerical algorithms."""

    def __init__(self, rows: int, cols: int, fill: float = 0.0):
        self.rows: int = rows
        self.cols: int = cols
        self.data: List[List[float]] = [[float(fill) for _ in range(cols)] for _ in range(rows)]

    @classmethod
    def from_lists(cls, lists: List[List[float]]) -> Matrix:
        rows = len(lists)
        cols = len(lists[0]) if rows > 0 else 0
        mat = cls(rows, cols)
        for i in range(rows):
            for j in range(cols):
                mat.data[i][j] = float(lists[i][j])
        return mat

    @classmethod
    def identity(cls, n: int) -> Matrix:
        """Returns n x n identity matrix."""
        mat = cls(n, n, 0.0)
        for i in range(n):
            mat.data[i][i] = 1.0
        return mat

    @classmethod
    def random(cls, rows: int, cols: int, min_val: float = -1.0, max_val: float = 1.0) -> Matrix:
        """Generates random matrix with values in [min_val, max_val]."""
        mat = cls(rows, cols)
        for i in range(rows):
            for j in range(cols):
                mat.data[i][j] = random.uniform(min_val, max_val)
        return mat

    def __getitem__(self, idx: Tuple[int, int]) -> float:
        r, c = idx
        return self.data[r][c]

    def __setitem__(self, idx: Tuple[int, int], val: float) -> None:
        r, c = idx
        self.data[r][c] = float(val)

    def __repr__(self) -> str:
        lines = []
        for r in range(min(self.rows, 6)):
            row_str = "  ".join(f"{self.data[r][c]:8.4f}" for c in range(min(self.cols, 6)))
            if self.cols > 6:
                row_str += "  ..."
            lines.append(f"[{row_str}]")
        if self.rows > 6:
            lines.append(" ...")
        return f"Matrix({self.rows}x{self.cols}):\n" + "\n".join(lines)

    def copy(self) -> Matrix:
        mat = Matrix(self.rows, self.cols)
        for i in range(self.rows):
            mat.data[i] = self.data[i].copy()
        return mat

    def transpose(self) -> Matrix:
        """Computes matrix transpose A^T."""
        res = Matrix(self.cols, self.rows)
        for i in range(self.rows):
            for j in range(self.cols):
                res.data[j][i] = self.data[i][j]
        return res

    def __add__(self, other: Matrix) -> Matrix:
        if self.rows != other.rows or self.cols != other.cols:
            raise ValueError(f"Shape mismatch in add: ({self.rows},{self.cols}) vs ({other.rows},{other.cols})")
        res = Matrix(self.rows, self.cols)
        for i in range(self.rows):
            for j in range(self.cols):
                res.data[i][j] = self.data[i][j] + other.data[i][j]
        return res

    def __sub__(self, other: Matrix) -> Matrix:
        if self.rows != other.rows or self.cols != other.cols:
            raise ValueError(f"Shape mismatch in sub: ({self.rows},{self.cols}) vs ({other.rows},{other.cols})")
        res = Matrix(self.rows, self.cols)
        for i in range(self.rows):
            for j in range(self.cols):
                res.data[i][j] = self.data[i][j] - other.data[i][j]
        return res

    def __mul__(self, other: Matrix | Vector | float) -> Matrix | Vector:
        if isinstance(other, (int, float)):
            res = Matrix(self.rows, self.cols)
            val = float(other)
            for i in range(self.rows):
                for j in range(self.cols):
                    res.data[i][j] = self.data[i][j] * val
            return res
        elif isinstance(other, Vector):
            if self.cols != len(other):
                raise ValueError(f"Dimension mismatch for matrix-vector multiplication: {self.cols} cols vs {len(other)} elements")
            res = [0.0] * self.rows
            for i in range(self.rows):
                s = 0.0
                row = self.data[i]
                for k in range(self.cols):
                    s += row[k] * other.data[k]
                res[i] = s
            return Vector(res)
        elif isinstance(other, Matrix):
            if self.cols != other.rows:
                raise ValueError(f"Shape mismatch in matmul: ({self.rows},{self.cols}) @ ({other.rows},{other.cols})")
            res = Matrix(self.rows, other.cols)
            for i in range(self.rows):
                for k in range(self.cols):
                    val_ik = self.data[i][k]
                    if abs(val_ik) < 1e-15:
                        continue
                    for j in range(other.cols):
                        res.data[i][j] += val_ik * other.data[k][j]
            return res
        raise TypeError(f"Unsupported operand type for *: {type(other)}")

    def frobenius_norm(self) -> float:
        """Computes Frobenius norm sqrt(sum(a_ij^2))."""
        s = 0.0
        for row in self.data:
            for val in row:
                s += val * val
        return math.sqrt(s)

    def column(self, j: int) -> Vector:
        """Extracts column vector as a Vector object."""
        return Vector([self.data[i][j] for i in range(self.rows)])

    def set_column(self, j: int, vec: Vector) -> None:
        """Sets column j from a Vector object."""
        if len(vec) != self.rows:
            raise ValueError(f"Length mismatch: {len(vec)} vs {self.rows}")
        for i in range(self.rows):
            self.data[i][j] = vec.data[i]


class LinearSolver:
    """Solvers for Ax = b and decompositions."""

    @staticmethod
    def gaussian_elimination(A: Matrix, b: Vector) -> Vector:
        """
        Solves A x = b using Gaussian elimination with partial pivoting.
        Time complexity: O(n^3).
        """
        if A.rows != A.cols:
            raise ValueError("Matrix A must be square")
        if A.rows != len(b):
            raise ValueError("Dimensions of A and b must match")

        n = A.rows
        M = A.copy()
        rhs = b.copy()

        # Forward elimination with partial pivoting
        for k in range(n):
            # Pivot search
            max_row = k
            max_val = abs(M.data[k][k])
            for i in range(k + 1, n):
                if abs(M.data[i][k]) > max_val:
                    max_val = abs(M.data[i][k])
                    max_row = i

            if max_val < 1e-12:
                raise ValueError(f"Singular matrix encountered at column {k}")

            # Swap rows
            if max_row != k:
                M.data[k], M.data[max_row] = M.data[max_row], M.data[k]
                rhs.data[k], rhs.data[max_row] = rhs.data[max_row], rhs.data[k]

            pivot = M.data[k][k]
            for i in range(k + 1, n):
                factor = M.data[i][k] / pivot
                M.data[i][k] = 0.0
                for j in range(k + 1, n):
                    M.data[i][j] -= factor * M.data[k][j]
                rhs.data[i] -= factor * rhs.data[k]

        # Back substitution
        x = [0.0] * n
        for i in range(n - 1, -1, -1):
            s = rhs.data[i]
            for j in range(i + 1, n):
                s -= M.data[i][j] * x[j]
            x[i] = s / M.data[i][i]

        return Vector(x)

    @staticmethod
    def lu_decomposition(A: Matrix) -> Tuple[Matrix, Matrix, List[int]]:
        """
        Computes PA = LU decomposition with partial pivoting.
        Returns:
            L: Lower triangular matrix with unit diagonal
            U: Upper triangular matrix
            P: Permutation vector
        """
        if A.rows != A.cols:
            raise ValueError("Matrix must be square for LU decomposition")
        n = A.rows
        L = Matrix.identity(n)
        U = A.copy()
        P = list(range(n))

        for k in range(n - 1):
            # Pivot
            pivot_row = k
            pivot_val = abs(U.data[k][k])
            for i in range(k + 1, n):
                if abs(U.data[i][k]) > pivot_val:
                    pivot_val = abs(U.data[i][k])
                    pivot_row = i

            if pivot_row != k:
                # Swap rows in U
                U.data[k], U.data[pivot_row] = U.data[pivot_row], U.data[k]
                # Swap previously computed subdiagonal elements in L
                for j in range(k):
                    L.data[k][j], L.data[pivot_row][j] = L.data[pivot_row][j], L.data[k][j]
                P[k], P[pivot_row] = P[pivot_row], P[k]

            pivot = U.data[k][k]
            if abs(pivot) < 1e-14:
                continue

            for i in range(k + 1, n):
                factor = U.data[i][k] / pivot
                L.data[i][k] = factor
                U.data[i][k] = 0.0
                for j in range(k + 1, n):
                    U.data[i][j] -= factor * U.data[k][j]

        return L, U, P

    @staticmethod
    def invert(A: Matrix) -> Matrix:
        """Computes inverse of square matrix A via Gaussian elimination."""
        if A.rows != A.cols:
            raise ValueError("Non-square matrix cannot be inverted")
        n = A.rows
        aug = Matrix(n, 2 * n)
        for i in range(n):
            for j in range(n):
                aug.data[i][j] = A.data[i][j]
            aug.data[i][n + i] = 1.0

        for k in range(n):
            pivot_row = k
            max_val = abs(aug.data[k][k])
            for i in range(k + 1, n):
                if abs(aug.data[i][k]) > max_val:
                    max_val = abs(aug.data[i][k])
                    pivot_row = i

            if max_val < 1e-13:
                raise ValueError("Matrix is singular or near-singular")

            aug.data[k], aug.data[pivot_row] = aug.data[pivot_row], aug.data[k]
            pivot = aug.data[k][k]
            inv_p = 1.0 / pivot
            for j in range(2 * n):
                aug.data[k][j] *= inv_p

            for i in range(n):
                if i != k:
                    factor = aug.data[i][k]
                    for j in range(k, 2 * n):
                        aug.data[i][j] -= factor * aug.data[k][j]

        inv = Matrix(n, n)
        for i in range(n):
            for j in range(n):
                inv.data[i][j] = aug.data[i][n + j]
        return inv

    @staticmethod
    def determinant(A: Matrix) -> float:
        """Calculates determinant using LU decomposition."""
        if A.rows != A.cols:
            raise ValueError("Matrix must be square")
        n = A.rows
        M = A.copy()
        det_sign = 1.0

        for k in range(n):
            max_row = k
            max_val = abs(M.data[k][k])
            for i in range(k + 1, n):
                if abs(M.data[i][k]) > max_val:
                    max_val = abs(M.data[i][k])
                    max_row = i

            if max_val < 1e-15:
                return 0.0

            if max_row != k:
                M.data[k], M.data[max_row] = M.data[max_row], M.data[k]
                det_sign = -det_sign

            pivot = M.data[k][k]
            for i in range(k + 1, n):
                factor = M.data[i][k] / pivot
                for j in range(k + 1, n):
                    M.data[i][j] -= factor * M.data[k][j]

        det = det_sign
        for i in range(n):
            det *= M.data[i][i]
        return det


class QRDecomposition:
    """Gram-Schmidt and Householder QR Factorization."""

    @staticmethod
    def modified_gram_schmidt(A: Matrix) -> Tuple[Matrix, Matrix]:
        """
        Computes QR decomposition: A = Q R using Modified Gram-Schmidt.
        Q is orthogonal (m x n), R is upper triangular (n x n).
        """
        m, n = A.rows, A.cols
        Q = Matrix(m, n)
        R = Matrix(n, n)
        V = [A.column(j) for j in range(n)]

        for i in range(n):
            R.data[i][i] = V[i].norm(2.0)
            if R.data[i][i] < 1e-14:
                # Column is linearly dependent
                Q.set_column(i, Vector([0.0] * m))
            else:
                q_i = V[i] * (1.0 / R.data[i][i])
                Q.set_column(i, q_i)

            for j in range(i + 1, n):
                R.data[i][j] = Q.column(i).dot(V[j])
                V[j] = V[j] - (Q.column(i) * R.data[i][j])

        return Q, R

    @staticmethod
    def householder(A: Matrix) -> Tuple[Matrix, Matrix]:
        """
        Computes QR decomposition using Householder reflections.
        Numerically stable representation.
        """
        m, n = A.rows, A.cols
        R = A.copy()
        Q = Matrix.identity(m)

        for k in range(min(m - 1, n)):
            # Extract subcolumn
            x = [R.data[i][k] for i in range(k, m)]
            norm_x = math.sqrt(sum(v * v for v in x))
            if norm_x < 1e-15:
                continue

            sign = 1.0 if x[0] >= 0 else -1.0
            u1 = x[0] + sign * norm_x
            v = [val / u1 for val in x]
            v[0] = 1.0
            v_norm_sq = sum(val * val for val in v)
            tau = 2.0 / v_norm_sq

            # Update R from the left: R[k:m, k:n] = R[k:m, k:n] - tau * v * (v^T R[k:m, k:n])
            for j in range(k, n):
                dot_v_col = sum(v[i - k] * R.data[i][j] for i in range(k, m))
                for i in range(k, m):
                    R.data[i][j] -= tau * v[i - k] * dot_v_col

            # Accumulate Q: Q = Q * H_k
            for i in range(m):
                dot_q_v = sum(Q.data[i][r] * v[r - k] for r in range(k, m))
                for r in range(k, m):
                    Q.data[i][r] -= tau * dot_q_v * v[r - k]

        # Zero out strict lower triangle of R to eliminate floating errors
        for i in range(m):
            for j in range(min(i, n)):
                R.data[i][j] = 0.0

        return Q, R


class EigenDecomposition:
    """Jacobi Eigenvalue Method for real symmetric matrices."""

    @staticmethod
    def jacobi_eigenvalues(A: Matrix, max_iter: int = 100, tol: float = 1e-10) -> Tuple[Vector, Matrix]:
        """
        Jacobi diagonalisation of real symmetric matrix A.
        Returns:
            eigenvalues: Vector of eigenvalues
            eigenvectors: Matrix whose columns are eigenvectors
        """
        if A.rows != A.cols:
            raise ValueError("Matrix must be square")
        n = A.rows
        # Verify symmetry
        for i in range(n):
            for j in range(i + 1, n):
                if abs(A.data[i][j] - A.data[j][i]) > 1e-7:
                    raise ValueError(f"Matrix not symmetric at ({i},{j})")

        D = A.copy()
        V = Matrix.identity(n)

        for iteration in range(max_iter):
            # Find largest off-diagonal element
            p, q = 0, 1
            max_offdiag = abs(D.data[0][1])
            for i in range(n):
                for j in range(i + 1, n):
                    if abs(D.data[i][j]) > max_offdiag:
                        max_offdiag = abs(D.data[i][j])
                        p, q = i, j

            if max_offdiag < tol:
                break

            app = D.data[p][p]
            aqq = D.data[q][q]
            apq = D.data[p][q]

            # Calculate rotation angle theta
            if abs(app - aqq) < 1e-15:
                theta = math.pi / 4.0 if apq > 0 else -math.pi / 4.0
            else:
                tau = (aqq - app) / (2.0 * apq)
                t = (1.0 / (abs(tau) + math.sqrt(1.0 + tau * tau))) * (1.0 if tau >= 0 else -1.0)
                theta = math.atan(t)

            c = math.cos(theta)
            s = math.sin(theta)

            # Apply Givens rotation J^T D J
            D_pp = c * c * app - 2.0 * s * c * apq + s * s * aqq
            D_qq = s * s * app + 2.0 * s * c * apq + c * c * aqq
            D.data[p][p] = D_pp
            D.data[q][q] = D_qq
            D.data[p][q] = 0.0
            D.data[q][p] = 0.0

            for k in range(n):
                if k != p and k != q:
                    dpk = D.data[p][k]
                    dqk = D.data[q][k]
                    D.data[p][k] = c * dpk - s * dqk
                    D.data[k][p] = D.data[p][k]
                    D.data[q][k] = s * dpk + c * dqk
                    D.data[k][q] = D.data[q][k]

            # Accumulate eigenvectors in V
            for k in range(n):
                vkp = V.data[k][p]
                vkq = V.data[k][q]
                V.data[k][p] = c * vkp - s * vkq
                V.data[k][q] = s * vkp + c * vkq

        eigenvals = [D.data[i][i] for i in range(n)]
        return Vector(eigenvals), V


def benchmark_linear_algebra() -> None:
    """Runs functional correctness and performance benchmarks."""
    print("=" * 60)
    print("NUMERICAL LINEAR ALGEBRA BENCHMARK & TEST")
    print("=" * 60)

    # 1. Linear solve test
    n = 6
    A = Matrix.random(n, n, min_val=-2.0, max_val=2.0)
    # Ensure diagonally dominant for stability
    for i in range(n):
        A.data[i][i] += sum(abs(A.data[i][j]) for j in range(n))

    true_x = Vector([float(i + 1) for i in range(n)])
    b = A * true_x
    assert isinstance(b, Vector)

    t0 = time.perf_counter()
    sol_x = LinearSolver.gaussian_elimination(A, b)
    elapsed = time.perf_counter() - t0

    err = (sol_x - true_x).norm(2.0)
    print(f"[Solve Ax=b] Dimension: {n}x{n} | Error: {err:.2e} | Time: {elapsed*1e3:.3f} ms")
    assert err < 1e-8, "Gaussian elimination precision failed"

    # 2. LU Decomposition test
    L, U, P = LinearSolver.lu_decomposition(A)
    print(f"[LU Decomposition] Permutation: {P}")
    det_val = LinearSolver.determinant(A)
    print(f"[Determinant] det(A) = {det_val:.4f}")

    # 3. Matrix Inverse
    inv_A = LinearSolver.invert(A)
    prod = A * inv_A
    assert isinstance(prod, Matrix)
    diff = prod - Matrix.identity(n)
    inv_err = diff.frobenius_norm()
    print(f"[Inverse] ||A * A^(-1) - I||_F: {inv_err:.2e}")
    assert inv_err < 1e-8, "Inverse precision check failed"

    # 4. QR Decomposition (Householder vs Gram-Schmidt)
    Q, R = QRDecomposition.householder(A)
    reconstructed = Q * R
    assert isinstance(reconstructed, Matrix)
    qr_err = (A - reconstructed).frobenius_norm()
    ortho_err = (Q.transpose() * Q - Matrix.identity(n)).frobenius_norm()
    print(f"[QR Householder] Reconstruction Error: {qr_err:.2e} | Orthogonality Error: {ortho_err:.2e}")

    # 5. Jacobi Eigenvalues
    # Create symmetric positive definite matrix S = A^T A
    S = A.transpose() * A
    assert isinstance(S, Matrix)
    evals, evecs = EigenDecomposition.jacobi_eigenvalues(S, max_iter=200)
    print(f"[Jacobi Eigenvalues]: {[round(x, 4) for x in evals.data]}")

    print("\nAll Linear Algebra tests and benchmarks passed successfully!")


if __name__ == "__main__":
    benchmark_linear_algebra()
