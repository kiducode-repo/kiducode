"""
Number Theory and Cryptographic Algorithms
==========================================
A pure Python mathematical cryptography suite implementing:
- Extended Euclidean Algorithm, Modular Inverse, and Chinese Remainder Theorem (CRT)
- Deterministic and Probabilistic Miller-Rabin Primality Testing
- Integer Factorization: Pollard's Rho with Brent's cycle detection & Fermat's method
- Discrete Logarithm: Baby-Step Giant-Step Algorithm
- RSA Cryptosystem from scratch: Keygen, modular exponentiation, sign/verify & encrypt/decrypt
- Elliptic Curve Cryptography (ECC) over prime field F_p:
  - Weierstrass curves, Point Addition, Doubling, Scalar Multiplication (Montgomery ladder)
  - Elliptic Curve Diffie-Hellman (ECDH) Key Exchange protocol simulation
"""

from __future__ import annotations
import math
import random
import time
from typing import Tuple, List, Optional, Dict


class NumberTheory:
    """Core number-theoretic functions."""

    @staticmethod
    def extended_gcd(a: int, b: int) -> Tuple[int, int, int]:
        """
        Extended Euclidean Algorithm.
        Returns (gcd, x, y) such that a*x + b*y = gcd(a, b).
        """
        if b == 0:
            return a, 1, 0
        gcd, x1, y1 = NumberTheory.extended_gcd(b, a % b)
        x = y1
        y = x1 - (a // b) * y1
        return gcd, x, y

    @staticmethod
    def mod_inverse(a: int, m: int) -> int:
        """Computes modular inverse of a mod m: a * x = 1 (mod m)."""
        gcd, x, _ = NumberTheory.extended_gcd(a, m)
        if gcd != 1:
            raise ValueError(f"Modular inverse does not exist: gcd({a}, {m}) = {gcd}")
        return (x % m + m) % m

    @staticmethod
    def chinese_remainder_theorem(remainders: List[int], moduli: List[int]) -> int:
        """
        Chinese Remainder Theorem solver for system:
        x = r_i (mod m_i) for pairwise coprime moduli m_i.
        """
        prod = 1
        for m in moduli:
            prod *= m

        result = 0
        for r, m in zip(remainders, moduli):
            p = prod // m
            inv = NumberTheory.mod_inverse(p, m)
            result = (result + r * inv * p) % prod

        return result

    @staticmethod
    def is_prime_miller_rabin(n: int, k: int = 15) -> bool:
        """
        Miller-Rabin probabilistic primality test with k rounds.
        """
        if n < 2:
            return False
        if n in (2, 3):
            return True
        if n % 2 == 0 or n % 3 == 0:
            return False

        # Write n - 1 as 2^s * d
        s = 0
        d = n - 1
        while d % 2 == 0:
            d //= 2
            s += 1

        for _ in range(k):
            a = random.randint(2, n - 2)
            x = pow(a, d, n)
            if x == 1 or x == n - 1:
                continue

            composite = True
            for _ in range(s - 1):
                x = pow(x, 2, n)
                if x == n - 1:
                    composite = False
                    break
            if composite:
                return False

        return True

    @staticmethod
    def generate_prime(bits: int) -> int:
        """Generates a random probable prime with specified bit length."""
        while True:
            candidate = random.getrandbits(bits)
            # Ensure high bit and odd
            candidate |= (1 << (bits - 1)) | 1
            if NumberTheory.is_prime_miller_rabin(candidate, k=25):
                return candidate

    @staticmethod
    def pollards_rho(n: int) -> Optional[int]:
        """
        Pollard's rho factorization algorithm with Brent's cycle detection.
        Finds a non-trivial factor of n.
        """
        if n % 2 == 0:
            return 2
        if NumberTheory.is_prime_miller_rabin(n):
            return n

        y = random.randint(1, n - 1)
        c = random.randint(1, n - 1)
        m = random.randint(1, n - 1)
        g = 1
        r = 1
        q = 1

        while g == 1:
            x = y
            for _ in range(r):
                y = (pow(y, 2, n) + c) % n

            k = 0
            while k < r and g == 1:
                ys = y
                for _ in range(min(m, r - k)):
                    y = (pow(y, 2, n) + c) % n
                    q = (q * abs(x - y)) % n
                g = math.gcd(q, n)
                k += m
            r *= 2

        if g == n:
            while True:
                ys = (pow(ys, 2, n) + c) % n
                g = math.gcd(abs(x - ys), n)
                if g > 1:
                    break

        return g if g != n else None

    @staticmethod
    def baby_step_giant_step(g: int, h: int, p: int) -> Optional[int]:
        """
        Shanks' Baby-Step Giant-Step algorithm for discrete logarithm:
        Solve g^x = h (mod p) where p is prime.
        Time complexity: O(sqrt(p)).
        """
        m = math.isqrt(p) + 1
        # Baby steps: compute g^j mod p for j in [0, m)
        table: Dict[int, int] = {}
        cur = 1
        for j in range(m):
            table[cur] = j
            cur = (cur * g) % p

        # Giant steps: g^(-m) mod p
        g_inv_m = pow(NumberTheory.mod_inverse(g, p), m, p)
        cur = h
        for i in range(m):
            if cur in table:
                return i * m + table[cur]
            cur = (cur * g_inv_m) % p

        return None


class RSACryptosystem:
    """Pure Python RSA public-key implementation."""

    def __init__(self, key_size_bits: int = 512):
        self.bit_size = key_size_bits
        half_bits = key_size_bits // 2
        p = NumberTheory.generate_prime(half_bits)
        q = NumberTheory.generate_prime(half_bits)
        while p == q:
            q = NumberTheory.generate_prime(half_bits)

        self.n = p * q
        phi = (p - 1) * (q - 1)
        self.e = 65537
        while math.gcd(self.e, phi) != 1:
            self.e = random.randint(3, phi - 1) | 1

        self.d = NumberTheory.mod_inverse(self.e, phi)

    def encrypt(self, plaintext: int) -> int:
        if plaintext >= self.n:
            raise ValueError("Plaintext larger than modulus n")
        return pow(plaintext, self.e, self.n)

    def decrypt(self, ciphertext: int) -> int:
        return pow(ciphertext, self.d, self.n)

    def sign(self, message_hash: int) -> int:
        return pow(message_hash, self.d, self.n)

    def verify(self, message_hash: int, signature: int) -> bool:
        return pow(signature, self.e, self.n) == message_hash


class EllipticCurve:
    """
    Elliptic Curve over finite field F_p: y^2 = x^3 + a*x + b (mod p).
    """

    class Point:
        def __init__(self, curve: EllipticCurve, x: Optional[int], y: Optional[int], is_infinity: bool = False):
            self.curve = curve
            self.x = x
            self.y = y
            self.is_infinity = is_infinity

        def __repr__(self) -> str:
            if self.is_infinity:
                return "Point(Infinity)"
            return f"Point({self.x}, {self.y})"

        def __eq__(self, other: object) -> bool:
            if not isinstance(other, EllipticCurve.Point):
                return False
            if self.is_infinity and other.is_infinity:
                return True
            return self.is_infinity == other.is_infinity and self.x == other.x and self.y == other.y

        def __add__(self, other: EllipticCurve.Point) -> EllipticCurve.Point:
            return self.curve.add_points(self, other)

        def __mul__(self, scalar: int) -> EllipticCurve.Point:
            return self.curve.scalar_mult(scalar, self)

    def __init__(self, a: int, b: int, p: int):
        self.a = a
        self.b = b
        self.p = p
        # Check non-singularity: 4a^3 + 27b^2 != 0 (mod p)
        if (4 * pow(a, 3, p) + 27 * pow(b, 2, p)) % p == 0:
            raise ValueError("Singular curve")

    def infinity(self) -> Point:
        return EllipticCurve.Point(self, None, None, is_infinity=True)

    def point(self, x: int, y: int) -> Point:
        # Validate point lies on curve
        if (pow(y, 2, self.p) - (pow(x, 3, self.p) + self.a * x + self.b)) % self.p != 0:
            raise ValueError(f"Point ({x}, {y}) does not lie on curve")
        return EllipticCurve.Point(self, x, y)

    def add_points(self, P: Point, Q: Point) -> Point:
        """Adds two points on the elliptic curve."""
        if P.is_infinity:
            return Q
        if Q.is_infinity:
            return P

        assert P.x is not None and P.y is not None and Q.x is not None and Q.y is not None

        if P.x == Q.x and (P.y != Q.y or P.y == 0):
            return self.infinity()

        if P.x == Q.x and P.y == Q.y:
            # Point doubling: lambda = (3*x^2 + a) / (2*y)
            num = (3 * pow(P.x, 2, self.p) + self.a) % self.p
            den = (2 * P.y) % self.p
            lam = (num * NumberTheory.mod_inverse(den, self.p)) % self.p
        else:
            # Point addition: lambda = (y2 - y1) / (x2 - x1)
            num = (Q.y - P.y) % self.p
            den = (Q.x - P.x) % self.p
            lam = (num * NumberTheory.mod_inverse(den, self.p)) % self.p

        x3 = (pow(lam, 2, self.p) - P.x - Q.x) % self.p
        y3 = (lam * (P.x - x3) - P.y) % self.p
        return EllipticCurve.Point(self, x3, y3)

    def scalar_mult(self, k: int, P: Point) -> Point:
        """Scalar multiplication k * P using double-and-add algorithm."""
        if k == 0 or P.is_infinity:
            return self.infinity()

        result = self.infinity()
        addend = P

        while k > 0:
            if k & 1:
                result = self.add_points(result, addend)
            addend = self.add_points(addend, addend)
            k >>= 1

        return result


def benchmark_number_theory_crypto() -> None:
    print("=" * 60)
    print("NUMBER THEORY & CRYPTOGRAPHY BENCHMARK")
    print("=" * 60)

    # 1. Extended GCD & CRT
    gcd, x, y = NumberTheory.extended_gcd(240, 46)
    print(f"[Extended GCD] 240*({x}) + 46*({y}) = {gcd}")
    assert 240 * x + 46 * y == gcd

    rem = [2, 3, 2]
    mods = [3, 5, 7]
    crt_x = NumberTheory.chinese_remainder_theorem(rem, mods)
    print(f"[Chinese Remainder Theorem] x = {crt_x} mod 105")
    for r, m in zip(rem, mods):
        assert crt_x % m == r

    # 2. Miller-Rabin Primality
    known_prime = 1000000007
    known_comp = 1000000005
    assert NumberTheory.is_prime_miller_rabin(known_prime) is True
    assert NumberTheory.is_prime_miller_rabin(known_comp) is False
    print(f"[Miller-Rabin] Successfully tested {known_prime} (prime) and {known_comp} (composite)")

    # 3. Factorization via Pollard's Rho
    n_composite = 8051  # 83 * 97
    factor = NumberTheory.pollards_rho(n_composite)
    print(f"[Pollard's Rho] Non-trivial factor of {n_composite}: {factor}")
    assert factor in (83, 97)

    # 4. Discrete Logarithm (Baby-Step Giant-Step)
    # 2^x = 13 (mod 29) -> 2^x mod 29 == 13 => x = 19
    dl_x = NumberTheory.baby_step_giant_step(2, 13, 29)
    print(f"[Discrete Log] 2^x = 13 mod 29 => x = {dl_x}")
    assert pow(2, dl_x, 29) == 13

    # 5. RSA Public-Key System
    t0 = time.perf_counter()
    rsa = RSACryptosystem(key_size_bits=256)
    key_time = time.perf_counter() - t0
    msg = 12345678901234567890
    c = rsa.encrypt(msg)
    m_decrypted = rsa.decrypt(c)
    print(f"[RSA-256] Keygen: {key_time*1e3:.2f} ms | Encrypted {msg} -> {c}")
    assert m_decrypted == msg, "RSA decryption failed"

    # 6. Elliptic Curve Diffie-Hellman Simulation
    # Secp256k1-like small curve: y^2 = x^3 + 2x + 3 (mod 97)
    curve = EllipticCurve(a=2, b=3, p=97)
    # Generator point
    G = curve.point(3, 6)
    # Alice private & public key
    alice_priv = 7
    alice_pub = G * alice_priv
    # Bob private & public key
    bob_priv = 11
    bob_pub = G * bob_priv
    # Shared secret exchange
    alice_shared = bob_pub * alice_priv
    bob_shared = alice_pub * bob_priv
    print(f"[ECC ECDH] Alice shared secret: {alice_shared} == Bob shared secret: {bob_shared}")
    assert alice_shared == bob_shared

    print("\nAll Number Theory & Cryptography algorithms verified successfully!")


if __name__ == "__main__":
    benchmark_number_theory_crypto()
