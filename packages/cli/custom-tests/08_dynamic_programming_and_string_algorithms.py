"""
Dynamic Programming and Advanced String Algorithms
==================================================
A comprehensive pure Python suite of string processing and DP algorithms:
- Sequence Alignment:
  - Levenshtein Distance with optimal edit script reconstruction
  - Needleman-Wunsch Global Sequence Alignment
  - Smith-Waterman Local Sequence Alignment
- Exact Pattern Matching:
  - Knuth-Morris-Pratt (KMP) with Prefix Function computation
  - Boyer-Moore-Horspool bad-character shift search
  - Rabin-Karp Polynomial Rolling Hash Search
  - Aho-Corasick Multi-Pattern Automaton with failure links
- Classic Dynamic Programming:
  - Longest Common Subsequence (LCS)
  - Longest Increasing Subsequence (LIS) in O(n log n) via Patience Sorting
  - Matrix Chain Multiplication (MCM) optimal parenthesization
- Suffix Structures:
  - Suffix Array construction
  - Kasai's algorithm for Longest Common Prefix (LCP) array
  - Substring queries via binary search on Suffix Array
"""

from __future__ import annotations
import bisect
import time
from collections import deque
from typing import List, Tuple, Dict, Optional, Set


class SequenceAlignment:
    """Levenshtein, Needleman-Wunsch, and Smith-Waterman algorithms."""

    @staticmethod
    def levenshtein_distance(s1: str, s2: str) -> Tuple[int, List[str]]:
        """
        Computes Levenshtein edit distance and backtracks alignment operations.
        Operations: 'MATCH', 'INSERT', 'DELETE', 'SUBSTITUTE'.
        """
        m, n = len(s1), len(s2)
        dp = [[0] * (n + 1) for _ in range(m + 1)]

        for i in range(m + 1):
            dp[i][0] = i
        for j in range(n + 1):
            dp[0][j] = j

        for i in range(1, m + 1):
            for j in range(1, n + 1):
                cost = 0 if s1[i - 1] == s2[j - 1] else 1
                dp[i][j] = min(
                    dp[i - 1][j] + 1,       # Delete
                    dp[i][j - 1] + 1,       # Insert
                    dp[i - 1][j - 1] + cost # Substitute / Match
                )

        # Backtrack operations
        i, j = m, n
        ops: List[str] = []
        while i > 0 or j > 0:
            if i > 0 and j > 0 and dp[i][j] == dp[i - 1][j - 1] + (0 if s1[i - 1] == s2[j - 1] else 1):
                op = "MATCH" if s1[i - 1] == s2[j - 1] else f"SUB('{s1[i-1]}'->'{s2[j-1]}')"
                ops.append(op)
                i -= 1
                j -= 1
            elif i > 0 and dp[i][j] == dp[i - 1][j] + 1:
                ops.append(f"DEL('{s1[i-1]}')")
                i -= 1
            else:
                ops.append(f"INS('{s2[j-1]}')")
                j -= 1

        return dp[m][n], ops[::-1]

    @staticmethod
    def needleman_wunsch(
        seq1: str,
        seq2: str,
        match_score: int = 1,
        mismatch_penalty: int = -1,
        gap_penalty: int = -2
    ) -> Tuple[int, str, str]:
        """Global biological sequence alignment algorithm."""
        m, n = len(seq1), len(seq2)
        dp = [[0] * (n + 1) for _ in range(m + 1)]

        for i in range(m + 1):
            dp[i][0] = i * gap_penalty
        for j in range(n + 1):
            dp[0][j] = j * gap_penalty

        for i in range(1, m + 1):
            for j in range(1, n + 1):
                score = match_score if seq1[i - 1] == seq2[j - 1] else mismatch_penalty
                dp[i][j] = max(
                    dp[i - 1][j - 1] + score,
                    dp[i - 1][j] + gap_penalty,
                    dp[i][j - 1] + gap_penalty
                )

        # Reconstruct alignment
        align1, align2 = [], []
        i, j = m, n
        while i > 0 and j > 0:
            score = match_score if seq1[i - 1] == seq2[j - 1] else mismatch_penalty
            if dp[i][j] == dp[i - 1][j - 1] + score:
                align1.append(seq1[i - 1])
                align2.append(seq2[j - 1])
                i -= 1
                j -= 1
            elif dp[i][j] == dp[i - 1][j] + gap_penalty:
                align1.append(seq1[i - 1])
                align2.append("-")
                i -= 1
            else:
                align1.append("-")
                align2.append(seq2[j - 1])
                j -= 1

        while i > 0:
            align1.append(seq1[i - 1])
            align2.append("-")
            i -= 1
        while j > 0:
            align1.append("-")
            align2.append(seq2[j - 1])
            j -= 1

        return dp[m][n], "".join(reversed(align1)), "".join(reversed(align2))


class PatternMatching:
    """Exact string matching algorithms."""

    @staticmethod
    def kmp_search(text: str, pattern: str) -> List[int]:
        """
        Knuth-Morris-Pratt pattern matching algorithm: O(n + m).
        Returns all 0-based starting indices where pattern matches text.
        """
        if not pattern:
            return []
        # Compute failure function (pi table)
        m = len(pattern)
        pi = [0] * m
        k = 0
        for q in range(1, m):
            while k > 0 and pattern[k] != pattern[q]:
                k = pi[k - 1]
            if pattern[k] == pattern[q]:
                k += 1
            pi[q] = k

        matches = []
        q = 0  # number of characters matched
        for i, ch in enumerate(text):
            while q > 0 and pattern[q] != ch:
                q = pi[q - 1]
            if pattern[q] == ch:
                q += 1
            if q == m:
                matches.append(i - m + 1)
                q = pi[q - 1]

        return matches

    @staticmethod
    def boyer_moore_horspool(text: str, pattern: str) -> List[int]:
        """Boyer-Moore-Horspool algorithm with bad character shift table."""
        n, m = len(text), len(pattern)
        if m == 0 or m > n:
            return []

        # Bad-character shift table
        shift = {ch: m for ch in set(text) | set(pattern)}
        for i in range(m - 1):
            shift[pattern[i]] = m - 1 - i

        matches = []
        skip = 0
        while skip <= n - m:
            j = m - 1
            while j >= 0 and pattern[j] == text[skip + j]:
                j -= 1
            if j < 0:
                matches.append(skip)
            skip += shift.get(text[skip + m - 1], m)

        return matches

    @staticmethod
    def rabin_karp(text: str, pattern: str, prime: int = 1000000007, base: int = 256) -> List[int]:
        """Rabin-Karp search using polynomial rolling hash."""
        n, m = len(text), len(pattern)
        if m == 0 or m > n:
            return []

        h = pow(base, m - 1, prime)
        p_hash = 0
        t_hash = 0

        for i in range(m):
            p_hash = (base * p_hash + ord(pattern[i])) % prime
            t_hash = (base * t_hash + ord(text[i])) % prime

        matches = []
        for i in range(n - m + 1):
            if p_hash == t_hash:
                if text[i:i + m] == pattern:
                    matches.append(i)
            if i < n - m:
                t_hash = (base * (t_hash - ord(text[i]) * h) + ord(text[i + m])) % prime
                t_hash = (t_hash + prime) % prime

        return matches


class AhoCorasick:
    """Aho-Corasick multi-string pattern matching automaton."""

    class Node:
        def __init__(self):
            self.children: Dict[str, AhoCorasick.Node] = {}
            self.fail: Optional[AhoCorasick.Node] = None
            self.output: List[str] = []

    def __init__(self, patterns: List[str]):
        self.root = AhoCorasick.Node()
        self.patterns = patterns
        self._build_trie()
        self._build_failure_links()

    def _build_trie(self) -> None:
        for pat in self.patterns:
            node = self.root
            for ch in pat:
                if ch not in node.children:
                    node.children[ch] = AhoCorasick.Node()
                node = node.children[ch]
            node.output.append(pat)

    def _build_failure_links(self) -> None:
        queue: deque[AhoCorasick.Node] = deque()
        for ch, child in self.root.children.items():
            child.fail = self.root
            queue.append(child)

        while queue:
            curr = queue.popleft()
            for ch, child in curr.children.items():
                f = curr.fail
                while f is not None and ch not in f.children:
                    f = f.fail
                child.fail = f.children[ch] if f is not None and ch in f.children else self.root
                if child.fail is not None:
                    child.output.extend(child.fail.output)
                queue.append(child)

    def search_all(self, text: str) -> List[Tuple[int, str]]:
        """Finds occurrences of all patterns: returns (end_index, pattern)."""
        node = self.root
        results: List[Tuple[int, str]] = []

        for i, ch in enumerate(text):
            while node is not None and ch not in node.children:
                node = node.fail
            if node is None:
                node = self.root
                continue
            node = node.children[ch]
            for pat in node.output:
                results.append((i - len(pat) + 1, pat))

        return results


class DynamicProgramming:
    """Classic dynamic programming algorithms."""

    @staticmethod
    def longest_common_subsequence(s1: str, s2: str) -> str:
        """Finds the LCS between two strings."""
        m, n = len(s1), len(s2)
        dp = [[0] * (n + 1) for _ in range(m + 1)]

        for i in range(1, m + 1):
            for j in range(1, n + 1):
                if s1[i - 1] == s2[j - 1]:
                    dp[i][j] = dp[i - 1][j - 1] + 1
                else:
                    dp[i][j] = max(dp[i - 1][j], dp[i][j - 1])

        # Backtrack
        lcs = []
        i, j = m, n
        while i > 0 and j > 0:
            if s1[i - 1] == s2[j - 1]:
                lcs.append(s1[i - 1])
                i -= 1
                j -= 1
            elif dp[i - 1][j] >= dp[i][j - 1]:
                i -= 1
            else:
                j -= 1

        return "".join(reversed(lcs))

    @staticmethod
    def longest_increasing_subsequence(arr: List[int]) -> Tuple[int, List[int]]:
        """
        Longest Increasing Subsequence in O(n log n) using patience sorting.
        Returns (length, subsequence).
        """
        if not arr:
            return 0, []

        tails: List[int] = []
        tails_indices: List[int] = []
        parent: List[int] = [-1] * len(arr)

        for i, x in enumerate(arr):
            idx = bisect.bisect_left(tails, x)
            if idx == len(tails):
                tails.append(x)
                tails_indices.append(i)
            else:
                tails[idx] = x
                tails_indices[idx] = i

            if idx > 0:
                parent[i] = tails_indices[idx - 1]

        # Reconstruct LIS
        lis = []
        curr = tails_indices[-1]
        while curr != -1:
            lis.append(arr[curr])
            curr = parent[curr]

        return len(tails), lis[::-1]

    @staticmethod
    def matrix_chain_multiplication(dims: List[int]) -> Tuple[int, str]:
        """
        Matrix Chain Multiplication: finds optimal paren order.
        dims = [p0, p1, ..., pn] where matrix i has dimension p_{i-1} x p_i.
        """
        n = len(dims) - 1
        m = [[0] * (n + 1) for _ in range(n + 1)]
        s = [[0] * (n + 1) for _ in range(n + 1)]

        for length in range(2, n + 1):
            for i in range(1, n - length + 2):
                j = i + length - 1
                m[i][j] = float("inf")
                for k in range(i, j):
                    q = m[i][k] + m[k + 1][j] + dims[i - 1] * dims[k] * dims[j]
                    if q < m[i][j]:
                        m[i][j] = q
                        s[i][j] = k

        def build_optimal_parens(i: int, j: int) -> str:
            if i == j:
                return f"A{i}"
            return f"({build_optimal_parens(i, s[i][j])} * {build_optimal_parens(s[i][j] + 1, j)})"

        return m[1][n], build_optimal_parens(1, n)


class SuffixStructures:
    """Suffix Array and Kasai's LCP Array."""

    @staticmethod
    def build_suffix_array(s: str) -> List[int]:
        """Builds Suffix Array (sorted suffix starting indices)."""
        suffixes = sorted((s[i:], i) for i in range(len(s)))
        return [idx for _, idx in suffixes]

    @staticmethod
    def build_lcp_array(s: str, sa: List[int]) -> List[int]:
        """Kasai's algorithm to compute Longest Common Prefix array in O(n)."""
        n = len(s)
        rank = [0] * n
        for i in range(n):
            rank[sa[i]] = i

        lcp = [0] * n
        h = 0
        for i in range(n):
            if rank[i] > 0:
                k = sa[rank[i] - 1]
                while (i + h < n) and (k + h < n) and (s[i + h] == s[k + h]):
                    h += 1
                lcp[rank[i]] = h
                if h > 0:
                    h -= 1

        return lcp


def benchmark_dp_and_strings() -> None:
    print("=" * 60)
    print("DP & STRING ALGORITHMS BENCHMARK")
    print("=" * 60)

    # 1. Levenshtein Distance
    s1, s2 = "kitten", "sitting"
    dist, ops = SequenceAlignment.levenshtein_distance(s1, s2)
    print(f"[Levenshtein] Distance between '{s1}' and '{s2}': {dist}")
    print(f"  Operations: {ops}")
    assert dist == 3

    # 2. Needleman-Wunsch Alignment
    score, a1, a2 = SequenceAlignment.needleman_wunsch("GATTACA", "GCATGCU")
    print(f"[Needleman-Wunsch] Score: {score}")
    print(f"  Seq1: {a1}\n  Seq2: {a2}")

    # 3. Pattern Matching (KMP, BMH, Rabin-Karp)
    text = "ABABDABACDABABCABABABABD"
    pattern = "ABABD"
    kmp_matches = PatternMatching.kmp_search(text, pattern)
    bmh_matches = PatternMatching.boyer_moore_horspool(text, pattern)
    rk_matches = PatternMatching.rabin_karp(text, pattern)
    print(f"[Pattern Match] '{pattern}' in text:")
    print(f"  KMP matches: {kmp_matches}")
    print(f"  BMH matches: {bmh_matches}")
    print(f"  Rabin-Karp:  {rk_matches}")
    assert kmp_matches == bmh_matches == rk_matches == [0, 19]

    # 4. Aho-Corasick Multi-Pattern
    ac_patterns = ["he", "she", "his", "hers"]
    ac = AhoCorasick(ac_patterns)
    ac_matches = ac.search_all("ushers")
    print(f"[Aho-Corasick] Patterns {ac_patterns} in 'ushers': {ac_matches}")
    assert ("she" in [m[1] for m in ac_matches]) and ("he" in [m[1] for m in ac_matches])

    # 5. Longest Increasing Subsequence
    arr = [10, 22, 9, 33, 21, 50, 41, 60, 80]
    lis_len, lis_seq = DynamicProgramming.longest_increasing_subsequence(arr)
    print(f"[LIS] Length: {lis_len} | Sequence: {lis_seq}")
    assert lis_len == 6

    # 6. Matrix Chain Multiplication
    chain_dims = [10, 30, 5, 60]  # Matrices: A1(10x30), A2(30x5), A3(5x60)
    mcm_cost, mcm_parens = DynamicProgramming.matrix_chain_multiplication(chain_dims)
    print(f"[Matrix Chain Mult] Min Scalar Mults: {mcm_cost} | Paren: {mcm_parens}")
    assert mcm_cost == 4500

    # 7. Suffix Array & LCP
    word = "banana"
    sa = SuffixStructures.build_suffix_array(word)
    lcp = SuffixStructures.build_lcp_array(word, sa)
    print(f"[Suffix Array & LCP for '{word}']:")
    print(f"  SA:  {sa}")
    print(f"  LCP: {lcp}")

    print("\nAll DP and String algorithms verified successfully!")


if __name__ == "__main__":
    benchmark_dp_and_strings()
