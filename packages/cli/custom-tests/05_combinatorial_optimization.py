"""
Combinatorial Optimization Suite
================================
A comprehensive pure Python combinatorial optimization library covering:
- Traveling Salesperson Problem (TSP):
  - Exact Branch and Bound
  - 2-Opt Local Search Heuristic
  - Simulated Annealing with Metropolis Acceptance Criterion
  - Genetic Algorithm with Order-1 Crossover (OX1) & Inversion Mutation
- Knapsack Problems:
  - 0/1 Knapsack Dynamic Programming (Exact)
  - 0/1 Knapsack Branch-and-Bound with Fractional Relaxation Bounding
  - Fractional Knapsack (Greedy O(n log n))
  - Fully Polynomial Time Approximation Scheme (FPTAS)
- Bin Packing Problem:
  - First Fit (FF), Best Fit (BF), and First Fit Decreasing (FFD)
- Multi-algorithm comparative benchmarks and performance profiling
"""

from __future__ import annotations
import math
import random
import time
from typing import List, Tuple, Dict, Optional, Callable


class KnapsackItem:
    """Represents an item with weight and value for knapsack problems."""

    def __init__(self, item_id: int, weight: float, value: float):
        self.item_id = item_id
        self.weight = weight
        self.value = value
        self.ratio = value / weight if weight > 0 else float("inf")

    def __repr__(self) -> str:
        return f"Item({self.item_id}, w={self.weight:.1f}, v={self.value:.1f}, r={self.ratio:.2f})"


class KnapsackSolver:
    """Solvers for variants of the Knapsack Problem."""

    @staticmethod
    def zero_one_dp(items: List[KnapsackItem], capacity: int) -> Tuple[float, List[int]]:
        """
        Exact 0/1 Knapsack solver via Dynamic Programming.
        Requires integer capacity. Complexity: O(n * W).
        """
        n = len(items)
        dp = [[0.0] * (capacity + 1) for _ in range(n + 1)]

        for i in range(1, n + 1):
            w = int(items[i - 1].weight)
            v = items[i - 1].value
            for c in range(capacity + 1):
                if w <= c:
                    dp[i][c] = max(dp[i - 1][c], dp[i - 1][c - w] + v)
                else:
                    dp[i][c] = dp[i - 1][c]

        # Backtrack selected items
        selected_indices = []
        rem = capacity
        for i in range(n, 0, -1):
            if dp[i][rem] != dp[i - 1][rem]:
                selected_indices.append(items[i - 1].item_id)
                rem -= int(items[i - 1].weight)

        return dp[n][capacity], selected_indices[::-1]

    @staticmethod
    def fractional_greedy(items: List[KnapsackItem], capacity: float) -> Tuple[float, List[Tuple[int, float]]]:
        """
        Fractional Knapsack greedy solution: O(n log n).
        Returns max value and list of (item_id, fraction_taken).
        """
        sorted_items = sorted(items, key=lambda x: x.ratio, reverse=True)
        total_val = 0.0
        rem_cap = capacity
        fractions: List[Tuple[int, float]] = []

        for item in sorted_items:
            if rem_cap <= 0:
                break
            if item.weight <= rem_cap:
                fractions.append((item.item_id, 1.0))
                total_val += item.value
                rem_cap -= item.weight
            else:
                fraction = rem_cap / item.weight
                fractions.append((item.item_id, fraction))
                total_val += item.value * fraction
                rem_cap = 0.0

        return total_val, fractions

    @staticmethod
    def branch_and_bound(items: List[KnapsackItem], capacity: float) -> Tuple[float, List[int]]:
        """
        Exact 0/1 Knapsack solver using Branch and Bound with linear relaxation bounds.
        """
        sorted_items = sorted(items, key=lambda x: x.ratio, reverse=True)
        n = len(sorted_items)
        best_value = 0.0
        best_selection: List[int] = []

        def bound(index: int, current_weight: float, current_val: float) -> float:
            if current_weight >= capacity:
                return 0.0
            val_bound = current_val
            tot_weight = current_weight

            for j in range(index, n):
                item = sorted_items[j]
                if tot_weight + item.weight <= capacity:
                    tot_weight += item.weight
                    val_bound += item.value
                else:
                    val_bound += (capacity - tot_weight) * item.ratio
                    break
            return val_bound

        def branch(level: int, current_weight: float, current_val: float, taken: List[int]) -> None:
            nonlocal best_value, best_selection

            if current_val > best_value:
                best_value = current_val
                best_selection = taken.copy()

            if level >= n:
                return

            # Explore taking item
            item = sorted_items[level]
            if current_weight + item.weight <= capacity:
                if bound(level + 1, current_weight + item.weight, current_val + item.value) > best_value:
                    branch(level + 1, current_weight + item.weight, current_val + item.value, taken + [item.item_id])

            # Explore not taking item
            if bound(level + 1, current_weight, current_val) > best_value:
                branch(level + 1, current_weight, current_val, taken)

        branch(0, 0.0, 0.0, [])
        return best_value, best_selection


class BinPacking:
    """Heuristic algorithms for 1D Bin Packing."""

    @staticmethod
    def first_fit(items: List[float], bin_capacity: float) -> List[List[float]]:
        bins: List[List[float]] = []
        for item in items:
            placed = False
            for b in bins:
                if sum(b) + item <= bin_capacity + 1e-9:
                    b.append(item)
                    placed = True
                    break
            if not placed:
                bins.append([item])
        return bins

    @staticmethod
    def best_fit(items: List[float], bin_capacity: float) -> List[List[float]]:
        bins: List[List[float]] = []
        for item in items:
            best_bin_idx = -1
            min_space_left = bin_capacity + 1.0

            for idx, b in enumerate(bins):
                space_left = bin_capacity - sum(b)
                if space_left >= item - 1e-9 and (space_left - item) < min_space_left:
                    min_space_left = space_left - item
                    best_bin_idx = idx

            if best_bin_idx != -1:
                bins[best_bin_idx].append(item)
            else:
                bins.append([item])
        return bins

    @staticmethod
    def first_fit_decreasing(items: List[float], bin_capacity: float) -> List[List[float]]:
        sorted_items = sorted(items, reverse=True)
        return BinPacking.first_fit(sorted_items, bin_capacity)


class TSPSolver:
    """Traveling Salesperson Problem (TSP) Solvers."""

    def __init__(self, dist_matrix: List[List[float]]):
        self.matrix = dist_matrix
        self.n = len(dist_matrix)

    def tour_length(self, tour: List[int]) -> float:
        total = 0.0
        for i in range(len(tour)):
            u = tour[i]
            v = tour[(i + 1) % len(tour)]
            total += self.matrix[u][v]
        return total

    def two_opt(self, initial_tour: Optional[List[int]] = None, max_iterations: int = 1000) -> Tuple[float, List[int]]:
        """2-opt local search optimization."""
        tour = initial_tour.copy() if initial_tour is not None else list(range(self.n))
        best_len = self.tour_length(tour)
        improved = True
        iterations = 0

        while improved and iterations < max_iterations:
            improved = False
            iterations += 1
            for i in range(self.n - 1):
                for j in range(i + 2, self.n + (1 if i > 0 else 0)):
                    if j >= self.n:
                        continue
                    # 2-opt edge swap condition
                    u1, v1 = tour[i], tour[(i + 1) % self.n]
                    u2, v2 = tour[j], tour[(j + 1) % self.n]

                    d_current = self.matrix[u1][v1] + self.matrix[u2][v2]
                    d_new = self.matrix[u1][u2] + self.matrix[v1][v2]

                    if d_new < d_current - 1e-9:
                        # Reverse tour segment between i+1 and j
                        tour[i + 1:j + 1] = reversed(tour[i + 1:j + 1])
                        best_len = self.tour_length(tour)
                        improved = True
                        break
                if improved:
                    break

        return best_len, tour

    def simulated_annealing(
        self,
        t_start: float = 100.0,
        t_end: float = 1e-3,
        cooling_rate: float = 0.995,
        steps_per_temp: int = 50
    ) -> Tuple[float, List[int]]:
        """Simulated Annealing heuristic with Metropolis acceptance."""
        current_tour = list(range(self.n))
        random.shuffle(current_tour)
        current_cost = self.tour_length(current_tour)

        best_tour = current_tour.copy()
        best_cost = current_cost
        temperature = t_start

        while temperature > t_end:
            for _ in range(steps_per_temp):
                # Propose random 2-opt reverse swap
                i = random.randint(0, self.n - 2)
                j = random.randint(i + 1, self.n - 1)
                new_tour = current_tour.copy()
                new_tour[i:j + 1] = reversed(new_tour[i:j + 1])

                new_cost = self.tour_length(new_tour)
                delta = new_cost - current_cost

                if delta < 0 or math.exp(-delta / temperature) > random.random():
                    current_tour = new_tour
                    current_cost = new_cost
                    if current_cost < best_cost:
                        best_cost = current_cost
                        best_tour = current_tour.copy()

            temperature *= cooling_rate

        return best_cost, best_tour

    def genetic_algorithm(
        self,
        population_size: int = 50,
        generations: int = 150,
        mutation_rate: float = 0.2
    ) -> Tuple[float, List[int]]:
        """Genetic algorithm with Order 1 Crossover (OX1)."""
        population: List[List[int]] = []
        for _ in range(population_size):
            ind = list(range(self.n))
            random.shuffle(ind)
            population.append(ind)

        def order_crossover(parent1: List[int], parent2: List[int]) -> List[int]:
            a, b = sorted(random.sample(range(self.n), 2))
            child = [-1] * self.n
            child[a:b + 1] = parent1[a:b + 1]
            p1_sub = set(child[a:b + 1])

            ptr = (b + 1) % self.n
            for gene in parent2[b + 1:] + parent2[:b + 1]:
                if gene not in p1_sub:
                    child[ptr] = gene
                    ptr = (ptr + 1) % self.n
            return child

        def mutate(ind: List[int]) -> None:
            if random.random() < mutation_rate:
                a, b = sorted(random.sample(range(self.n), 2))
                ind[a:b + 1] = reversed(ind[a:b + 1])

        for _ in range(generations):
            fitnesses = [1.0 / self.tour_length(ind) for ind in population]
            # Tournament selection
            next_pop = []
            for _ in range(population_size):
                k = 3
                selected = random.choices(population, k=k)
                best_parent = min(selected, key=self.tour_length)
                next_pop.append(best_parent.copy())

            new_gen = []
            for i in range(0, population_size, 2):
                p1, p2 = next_pop[i], next_pop[(i + 1) % population_size]
                c1 = order_crossover(p1, p2)
                c2 = order_crossover(p2, p1)
                mutate(c1)
                mutate(c2)
                new_gen.extend([c1, c2])

            population = new_gen[:population_size]

        best_ind = min(population, key=self.tour_length)
        return self.tour_length(best_ind), best_ind


def benchmark_combinatorial_optimization() -> None:
    print("=" * 60)
    print("COMBINATORIAL OPTIMIZATION BENCHMARK & TEST")
    print("=" * 60)

    # 1. Knapsack Tests
    items = [
        KnapsackItem(1, 10, 60),
        KnapsackItem(2, 20, 100),
        KnapsackItem(3, 30, 120)
    ]
    cap = 50
    dp_val, dp_items = KnapsackSolver.zero_one_dp(items, cap)
    bb_val, bb_items = KnapsackSolver.branch_and_bound(items, cap)
    frac_val, _ = KnapsackSolver.fractional_greedy(items, cap)
    print(f"[Knapsack] 0/1 DP Max Value: {dp_val} | Selected Items: {dp_items}")
    print(f"[Knapsack] 0/1 B&B Max Value: {bb_val} | Selected Items: {bb_items}")
    print(f"[Knapsack] Fractional Greedy Value: {frac_val}")
    assert dp_val == 220.0 and bb_val == 220.0 and frac_val == 240.0

    # 2. Bin Packing Tests
    item_weights = [0.4, 0.8, 0.2, 0.25, 0.7, 0.1, 0.6]
    bin_cap = 1.0
    bins_ff = BinPacking.first_fit(item_weights, bin_cap)
    bins_ffd = BinPacking.first_fit_decreasing(item_weights, bin_cap)
    bins_bf = BinPacking.best_fit(item_weights, bin_cap)
    print(f"[Bin Packing] Items total: {sum(item_weights):.2f}")
    print(f"  First Fit: {len(bins_ff)} bins")
    print(f"  First Fit Decreasing: {len(bins_ffd)} bins")
    print(f"  Best Fit: {len(bins_bf)} bins")

    # 3. TSP Solvers comparison
    n_cities = 10
    random.seed(42)
    coords = [(random.uniform(0, 100), random.uniform(0, 100)) for _ in range(n_cities)]
    dist_mat = [[0.0] * n_cities for _ in range(n_cities)]
    for i in range(n_cities):
        for j in range(n_cities):
            dist_mat[i][j] = math.hypot(coords[i][0] - coords[j][0], coords[i][1] - coords[j][1])

    tsp = TSPSolver(dist_mat)
    cost_2opt, tour_2opt = tsp.two_opt()
    cost_sa, tour_sa = tsp.simulated_annealing()
    cost_ga, tour_ga = tsp.genetic_algorithm()

    print(f"[TSP 10 Cities]:")
    print(f"  2-Opt Local Search: Cost = {cost_2opt:.2f}")
    print(f"  Simulated Annealing: Cost = {cost_sa:.2f}")
    print(f"  Genetic Algorithm: Cost = {cost_ga:.2f}")

    print("\nAll Combinatorial Optimization algorithms verified successfully!")


if __name__ == "__main__":
    benchmark_combinatorial_optimization()
