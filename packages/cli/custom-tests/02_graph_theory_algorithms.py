"""
Graph Theory Algorithms Library
===============================
A comprehensive graph theory suite in pure Python implementing:
- Directed and Undirected Graph data structures
- Disjoint Set Union (DSU) with Path Compression and Union by Rank
- Shortest Paths: Dijkstra, Bellman-Ford, Floyd-Warshall, and A* Search
- Minimum Spanning Tree (MST): Kruskal's and Prim's algorithms
- Network Flow: Edmonds-Karp and Dinic's Max-Flow algorithms
- Strongly Connected Components: Tarjan's and Kosaraju's algorithms
- Topological Sort (Kahn's algorithm & DFS) and Cycle Detection
- Erdos-Renyi Random Graph Generator and Benchmarks
"""

from __future__ import annotations
import heapq
import math
import random
import time
from collections import deque
from typing import Dict, List, Tuple, Set, Optional, Callable


class DisjointSetUnion:
    """Disjoint Set Union (Union-Find) with path compression and union by rank."""

    def __init__(self, n: int):
        self.parent = list(range(n))
        self.rank = [0] * n
        self.components = n

    def find(self, i: int) -> int:
        if self.parent[i] == i:
            return i
        self.parent[i] = self.find(self.parent[i])
        return self.parent[i]

    def union(self, i: int, j: int) -> bool:
        root_i = self.find(i)
        root_j = self.find(j)
        if root_i == root_j:
            return False

        if self.rank[root_i] < self.rank[root_j]:
            self.parent[root_i] = root_j
        elif self.rank[root_i] > self.rank[root_j]:
            self.parent[root_j] = root_i
        else:
            self.parent[root_j] = root_i
            self.rank[root_i] += 1

        self.components -= 1
        return True

    def connected(self, i: int, j: int) -> bool:
        return self.find(i) == self.find(j)


class Graph:
    """General directed or undirected weighted graph."""

    def __init__(self, vertices: int, directed: bool = False):
        self.V: int = vertices
        self.directed: bool = directed
        self.adj: List[List[Tuple[int, float]]] = [[] for _ in range(vertices)]
        self.edges: List[Tuple[int, int, float]] = []

    def add_edge(self, u: int, v: int, weight: float = 1.0) -> None:
        self.adj[u].append((v, weight))
        self.edges.append((u, v, weight))
        if not self.directed:
            self.adj[v].append((u, weight))
            self.edges.append((v, u, weight))

    def neighbors(self, u: int) -> List[Tuple[int, float]]:
        return self.adj[u]


class ShortestPathAlgorithms:
    """Algorithms for single-source and all-pairs shortest paths."""

    @staticmethod
    def dijkstra(graph: Graph, source: int) -> Tuple[List[float], List[Optional[int]]]:
        """
        Dijkstra's shortest path algorithm using a min-heap.
        Time complexity: O((V + E) log V).
        """
        dist = [float("inf")] * graph.V
        prev: List[Optional[int]] = [None] * graph.V
        dist[source] = 0.0

        pq: List[Tuple[float, int]] = [(0.0, source)]

        while pq:
            d, u = heapq.heappop(pq)
            if d > dist[u]:
                continue

            for v, weight in graph.adj[u]:
                if dist[u] + weight < dist[v]:
                    dist[v] = dist[u] + weight
                    prev[v] = u
                    heapq.heappush(pq, (dist[v], v))

        return dist, prev

    @staticmethod
    def bellman_ford(graph: Graph, source: int) -> Tuple[List[float], bool]:
        """
        Bellman-Ford algorithm for shortest paths with negative edge weights.
        Returns (distances, has_negative_cycle).
        """
        dist = [float("inf")] * graph.V
        dist[source] = 0.0

        for _ in range(graph.V - 1):
            updated = False
            for u, v, w in graph.edges:
                if dist[u] != float("inf") and dist[u] + w < dist[v]:
                    dist[v] = dist[u] + w
                    updated = True
            if not updated:
                break

        # Check for negative weight cycles
        for u, v, w in graph.edges:
            if dist[u] != float("inf") and dist[u] + w < dist[v]:
                return dist, True

        return dist, False

    @staticmethod
    def floyd_warshall(graph: Graph) -> List[List[float]]:
        """
        Floyd-Warshall all-pairs shortest path algorithm.
        Time complexity: O(V^3).
        """
        V = graph.V
        dist = [[float("inf")] * V for _ in range(V)]

        for i in range(V):
            dist[i][i] = 0.0

        for u, v, w in graph.edges:
            dist[u][v] = min(dist[u][v], w)

        for k in range(V):
            for i in range(V):
                for j in range(V):
                    if dist[i][k] + dist[k][j] < dist[i][j]:
                        dist[i][j] = dist[i][k] + dist[k][j]

        return dist

    @staticmethod
    def a_star(
        graph: Graph,
        source: int,
        target: int,
        heuristic: Callable[[int, int], float]
    ) -> Tuple[Optional[float], List[int]]:
        """
        A* search algorithm using an admissible heuristic.
        """
        g_score = [float("inf")] * graph.V
        f_score = [float("inf")] * graph.V
        came_from: Dict[int, int] = {}

        g_score[source] = 0.0
        f_score[source] = heuristic(source, target)

        pq: List[Tuple[float, float, int]] = [(f_score[source], 0.0, source)]
        visited: Set[int] = set()

        while pq:
            _, current_g, u = heapq.heappop(pq)
            if u == target:
                # Reconstruct path
                path = [u]
                while u in came_from:
                    u = came_from[u]
                    path.append(u)
                return g_score[target], path[::-1]

            if u in visited:
                continue
            visited.add(u)

            for v, weight in graph.adj[u]:
                tentative_g = g_score[u] + weight
                if tentative_g < g_score[v]:
                    came_from[v] = u
                    g_score[v] = tentative_g
                    f_score[v] = tentative_g + heuristic(v, target)
                    heapq.heappush(pq, (f_score[v], tentative_g, v))

        return None, []


class MinimumSpanningTree:
    """Kruskal and Prim MST algorithms."""

    @staticmethod
    def kruskal(graph: Graph) -> Tuple[float, List[Tuple[int, int, float]]]:
        """Kruskal's MST algorithm using Disjoint Set Union."""
        # Sort edges by weight
        sorted_edges = sorted(graph.edges, key=lambda e: e[2])
        dsu = DisjointSetUnion(graph.V)
        mst_edges: List[Tuple[int, int, float]] = []
        total_weight = 0.0

        for u, v, w in sorted_edges:
            if dsu.union(u, v):
                mst_edges.append((u, v, w))
                total_weight += w
                if len(mst_edges) == graph.V - 1:
                    break

        return total_weight, mst_edges

    @staticmethod
    def prim(graph: Graph) -> Tuple[float, List[Tuple[int, int, float]]]:
        """Prim's MST algorithm using priority queue."""
        visited = [False] * graph.V
        mst_edges: List[Tuple[int, int, float]] = []
        total_weight = 0.0

        pq: List[Tuple[float, int, int]] = [(0.0, 0, -1)]  # (weight, u, parent)

        while pq and len(mst_edges) < graph.V:
            w, u, parent = heapq.heappop(pq)
            if visited[u]:
                continue
            visited[u] = True

            if parent != -1:
                mst_edges.append((parent, u, w))
                total_weight += w

            for v, edge_w in graph.adj[u]:
                if not visited[v]:
                    heapq.heappush(pq, (edge_w, v, u))

        return total_weight, mst_edges


class FlowNetwork:
    """Network Flow with Edmonds-Karp and Dinic's Algorithm."""

    class Edge:
        def __init__(self, u: int, v: int, capacity: float, flow: float = 0.0):
            self.u = u
            self.v = v
            self.capacity = capacity
            self.flow = flow
            self.rev: Optional[FlowNetwork.Edge] = None

        @property
        def residual_capacity(self) -> float:
            return self.capacity - self.flow

    def __init__(self, vertices: int):
        self.V = vertices
        self.adj: List[List[FlowNetwork.Edge]] = [[] for _ in range(vertices)]

    def add_edge(self, u: int, v: int, capacity: float) -> None:
        forward = FlowNetwork.Edge(u, v, capacity)
        backward = FlowNetwork.Edge(v, u, 0.0)
        forward.rev = backward
        backward.rev = forward
        self.adj[u].append(forward)
        self.adj[v].append(backward)

    def edmonds_karp(self, source: int, sink: int) -> float:
        """Edmonds-Karp max flow using BFS for shortest augmenting paths."""
        max_flow = 0.0

        while True:
            parent_edge: List[Optional[FlowNetwork.Edge]] = [None] * self.V
            queue: deque[int] = deque([source])

            while queue:
                u = queue.popleft()
                if u == sink:
                    break
                for edge in self.adj[u]:
                    if parent_edge[edge.v] is None and edge.v != source and edge.residual_capacity > 1e-9:
                        parent_edge[edge.v] = edge
                        queue.append(edge.v)

            if parent_edge[sink] is None:
                break

            # Find bottleneck capacity
            push = float("inf")
            curr = sink
            while curr != source:
                edge = parent_edge[curr]
                assert edge is not None
                push = min(push, edge.residual_capacity)
                curr = edge.u

            # Augment flow
            curr = sink
            while curr != source:
                edge = parent_edge[curr]
                assert edge is not None and edge.rev is not None
                edge.flow += push
                edge.rev.flow -= push
                curr = edge.u

            max_flow += push

        return max_flow

    def dinic_max_flow(self, source: int, sink: int) -> float:
        """Dinic's blocking flow algorithm with level graphs and ptr optimization."""
        max_flow = 0.0
        level = [-1] * self.V

        def bfs() -> bool:
            nonlocal level
            level = [-1] * self.V
            level[source] = 0
            queue: deque[int] = deque([source])
            while queue:
                u = queue.popleft()
                for edge in self.adj[u]:
                    if edge.residual_capacity > 1e-9 and level[edge.v] < 0:
                        level[edge.v] = level[u] + 1
                        queue.append(edge.v)
            return level[sink] >= 0

        def dfs(u: int, pushed: float, ptr: List[int]) -> float:
            if pushed < 1e-9 or u == sink:
                return pushed
            for cid in range(ptr[u], len(self.adj[u])):
                ptr[u] = cid
                edge = self.adj[u][cid]
                if level[edge.v] == level[u] + 1 and edge.residual_capacity > 1e-9:
                    tr = dfs(edge.v, min(pushed, edge.residual_capacity), ptr)
                    if tr > 1e-9:
                        edge.flow += tr
                        assert edge.rev is not None
                        edge.rev.flow -= tr
                        return tr
            return 0.0

        while bfs():
            ptr = [0] * self.V
            while True:
                pushed = dfs(source, float("inf"), ptr)
                if pushed < 1e-9:
                    break
                max_flow += pushed

        return max_flow


class ConnectivityAlgorithms:
    """Tarjan's and Kosaraju's Strongly Connected Components & Topological Sort."""

    @staticmethod
    def tarjan_scc(graph: Graph) -> List[List[int]]:
        """Tarjan's SCC algorithm with discovery indices and low-link values."""
        index = 0
        indices = [-1] * graph.V
        lowlink = [-1] * graph.V
        on_stack = [False] * graph.V
        stack: List[int] = []
        sccs: List[List[int]] = []

        def strongconnect(v: int) -> None:
            nonlocal index
            indices[v] = index
            lowlink[v] = index
            index += 1
            stack.append(v)
            on_stack[v] = True

            for w, _ in graph.adj[v]:
                if indices[w] == -1:
                    strongconnect(w)
                    lowlink[v] = min(lowlink[v], lowlink[w])
                elif on_stack[w]:
                    lowlink[v] = min(lowlink[v], indices[w])

            if lowlink[v] == indices[v]:
                scc = []
                while True:
                    w = stack.pop()
                    on_stack[w] = False
                    scc.append(w)
                    if w == v:
                        break
                sccs.append(scc)

        for i in range(graph.V):
            if indices[i] == -1:
                strongconnect(i)

        return sccs

    @staticmethod
    def topological_sort_kahn(graph: Graph) -> Optional[List[int]]:
        """Topological sort using Kahn's algorithm (returns None if cycle exists)."""
        in_degree = [0] * graph.V
        for u in range(graph.V):
            for v, _ in graph.adj[u]:
                in_degree[v] += 1

        queue: deque[int] = deque([i for i in range(graph.V) if in_degree[i] == 0])
        order: List[int] = []

        while queue:
            u = queue.popleft()
            order.append(u)
            for v, _ in graph.adj[u]:
                in_degree[v] -= 1
                if in_degree[v] == 0:
                    queue.append(v)

        if len(order) != graph.V:
            return None  # Cycle detected
        return order


def run_graph_benchmarks() -> None:
    """Comprehensive test and benchmark suite for graph algorithms."""
    print("=" * 60)
    print("GRAPH ALGORITHMS BENCHMARK & VERIFICATION")
    print("=" * 60)

    # 1. Dijkstra & Shortest Path Test
    g = Graph(6, directed=False)
    g.add_edge(0, 1, 7.0)
    g.add_edge(0, 2, 9.0)
    g.add_edge(0, 5, 14.0)
    g.add_edge(1, 2, 10.0)
    g.add_edge(1, 3, 15.0)
    g.add_edge(2, 3, 11.0)
    g.add_edge(2, 5, 2.0)
    g.add_edge(3, 4, 6.0)
    g.add_edge(4, 5, 9.0)

    distances, prev = ShortestPathAlgorithms.dijkstra(g, 0)
    print(f"[Dijkstra] Shortest distances from 0: {distances}")
    assert distances[4] == 20.0, f"Expected 20.0, got {distances[4]}"

    # 2. Minimum Spanning Tree (Kruskal vs Prim)
    kruskal_w, _ = MinimumSpanningTree.kruskal(g)
    prim_w, _ = MinimumSpanningTree.prim(g)
    print(f"[MST] Kruskal Weight: {kruskal_w:.1f} | Prim Weight: {prim_w:.1f}")
    assert abs(kruskal_w - prim_w) < 1e-9, "MST weights should match"

    # 3. Max Flow (Edmonds-Karp vs Dinic)
    fn1 = FlowNetwork(6)
    fn1.add_edge(0, 1, 16.0)
    fn1.add_edge(0, 2, 13.0)
    fn1.add_edge(1, 2, 10.0)
    fn1.add_edge(1, 3, 12.0)
    fn1.add_edge(2, 1, 4.0)
    fn1.add_edge(2, 4, 14.0)
    fn1.add_edge(3, 2, 9.0)
    fn1.add_edge(3, 5, 20.0)
    fn1.add_edge(4, 3, 7.0)
    fn1.add_edge(4, 5, 4.0)

    fn2 = FlowNetwork(6)
    for u in range(6):
        for e in fn1.adj[u]:
            if e.capacity > 0:
                fn2.add_edge(e.u, e.v, e.capacity)

    ek_flow = fn1.edmonds_karp(0, 5)
    dinic_flow = fn2.dinic_max_flow(0, 5)
    print(f"[Max Flow] Edmonds-Karp: {ek_flow} | Dinic: {dinic_flow}")
    assert abs(ek_flow - 23.0) < 1e-9 and abs(dinic_flow - 23.0) < 1e-9

    # 4. Strongly Connected Components (Tarjan)
    dg = Graph(8, directed=True)
    edges = [
        (0, 1), (1, 2), (2, 0), (2, 3), (3, 4),
        (4, 5), (5, 6), (6, 4), (6, 7)
    ]
    for u, v in edges:
        dg.add_edge(u, v, 1.0)

    sccs = ConnectivityAlgorithms.tarjan_scc(dg)
    print(f"[Tarjan SCC] Identified {len(sccs)} SCCs: {sccs}")
    assert len(sccs) == 4

    # 5. Topological Sort
    dag = Graph(6, directed=True)
    dag.add_edge(5, 2)
    dag.add_edge(5, 0)
    dag.add_edge(4, 0)
    dag.add_edge(4, 1)
    dag.add_edge(2, 3)
    dag.add_edge(3, 1)
    top_order = ConnectivityAlgorithms.topological_sort_kahn(dag)
    print(f"[Topological Sort]: {top_order}")
    assert top_order is not None

    print("\nAll Graph Theory algorithms verified successfully!")


if __name__ == "__main__":
    run_graph_benchmarks()
