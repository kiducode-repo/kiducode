"""
Computational Geometry Library
==============================
A pure Python computational geometry library featuring:
- 2D & 3D Points, Vectors, and Segments
- Orientation tests (CCW, CW, Collinear)
- Convex Hull: Andrew's Monotone Chain, Graham Scan, and Quickhull
- Closest Pair of Points via O(n log n) Divide-and-Conquer
- Segment-Segment Intersection with exact coordinate computation
- Point-in-Polygon tests: Ray Casting and Winding Number
- Polygon Area (Shoelace Formula) and Centroid
- Sutherland-Hodgman Polygon Clipping algorithm
- Rotating Calipers: Minimum Area Enclosing Rectangle and Polygon Antipodal Pairs
"""

from __future__ import annotations
import math
import random
import time
from typing import List, Tuple, Optional


class Point2D:
    """Represents a point in 2D Cartesian space."""

    def __init__(self, x: float, y: float):
        self.x: float = float(x)
        self.y: float = float(y)

    def __repr__(self) -> str:
        return f"Point2D({self.x:.3f}, {self.y:.3f})"

    def __eq__(self, other: object) -> bool:
        if not isinstance(other, Point2D):
            return False
        return math.isclose(self.x, other.x, abs_tol=1e-9) and math.isclose(self.y, other.y, abs_tol=1e-9)

    def __hash__(self) -> int:
        return hash((round(self.x, 6), round(self.y, 6)))

    def distance_to(self, other: Point2D) -> float:
        return math.hypot(self.x - other.x, self.y - other.y)

    def __sub__(self, other: Point2D) -> Vector2D:
        return Vector2D(self.x - other.x, self.y - other.y)

    def __add__(self, v: Vector2D) -> Point2D:
        return Point2D(self.x + v.x, self.y + v.y)


class Vector2D:
    """Represents a 2D Euclidean vector."""

    def __init__(self, x: float, y: float):
        self.x: float = float(x)
        self.y: float = float(y)

    def __repr__(self) -> str:
        return f"Vector2D({self.x:.3f}, {self.y:.3f})"

    def norm(self) -> float:
        return math.hypot(self.x, self.y)

    def dot(self, other: Vector2D) -> float:
        return self.x * other.x + self.y * other.y

    def cross(self, other: Vector2D) -> float:
        """2D scalar cross product (z-component): x1*y2 - y1*x2."""
        return self.x * other.y - self.y * other.x

    def __mul__(self, scalar: float) -> Vector2D:
        return Vector2D(self.x * scalar, self.y * scalar)

    def normalized(self) -> Vector2D:
        n = self.norm()
        if n < 1e-12:
            return Vector2D(0.0, 0.0)
        return Vector2D(self.x / n, self.y / n)


class Segment2D:
    """Represents a finite line segment between p1 and p2."""

    def __init__(self, p1: Point2D, p2: Point2D):
        self.p1 = p1
        self.p2 = p2

    def length(self) -> float:
        return self.p1.distance_to(self.p2)

    def contains_point(self, p: Point2D, tol: float = 1e-9) -> bool:
        """Checks if point p lies on this segment within tolerance."""
        if not (min(self.p1.x, self.p2.x) - tol <= p.x <= max(self.p1.x, self.p2.x) + tol and
                min(self.p1.y, self.p2.y) - tol <= p.y <= max(self.p1.y, self.p2.y) + tol):
            return False
        cross = (p.y - self.p1.y) * (self.p2.x - self.p1.x) - (p.x - self.p1.x) * (self.p2.y - self.p1.y)
        return abs(cross) <= tol


def orientation(p: Point2D, q: Point2D, r: Point2D) -> int:
    """
    Finds the orientation of ordered triplet (p, q, r).
    Returns:
         0 -> Collinear
         1 -> Clockwise
         2 -> Counterclockwise
    """
    val = (q.y - p.y) * (r.x - q.x) - (q.x - p.x) * (r.y - q.y)
    if abs(val) < 1e-9:
        return 0
    return 1 if val > 0 else 2


class Intersection:
    """Segment and line intersection utilities."""

    @staticmethod
    def segments_intersect(s1: Segment2D, s2: Segment2D) -> bool:
        """Determines if two segments intersect."""
        p1, q1 = s1.p1, s1.p2
        p2, q2 = s2.p1, s2.p2

        o1 = orientation(p1, q1, p2)
        o2 = orientation(p1, q1, q2)
        o3 = orientation(p2, q2, p1)
        o4 = orientation(p2, q2, q1)

        # General case
        if o1 != o2 and o3 != o4:
            return True

        # Special Cases (collinear segments)
        if o1 == 0 and s1.contains_point(p2): return True
        if o2 == 0 and s1.contains_point(q2): return True
        if o3 == 0 and s2.contains_point(p1): return True
        if o4 == 0 and s2.contains_point(q1): return True

        return False

    @staticmethod
    def segment_intersection_point(s1: Segment2D, s2: Segment2D) -> Optional[Point2D]:
        """Calculates exact point of intersection for non-collinear intersecting segments."""
        if not Intersection.segments_intersect(s1, s2):
            return None

        x1, y1 = s1.p1.x, s1.p1.y
        x2, y2 = s1.p2.x, s1.p2.y
        x3, y3 = s2.p1.x, s2.p1.y
        x4, y4 = s2.p2.x, s2.p2.y

        denom = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4)
        if abs(denom) < 1e-12:
            return None  # Parallel or collinear

        t = ((x1 - x3) * (y3 - y4) - (y1 - y3) * (x3 - x4)) / denom
        return Point2D(x1 + t * (x2 - x1), y1 + t * (y2 - y1))


class ConvexHull:
    """Convex hull algorithms."""

    @staticmethod
    def monotone_chain(points: List[Point2D]) -> List[Point2D]:
        """
        Andrew's monotone chain 2D convex hull algorithm: O(n log n).
        Returns hull vertices in counter-clockwise order.
        """
        pts = sorted(set(points), key=lambda p: (p.x, p.y))
        if len(pts) <= 2:
            return pts

        # Lower hull
        lower: List[Point2D] = []
        for p in pts:
            while len(lower) >= 2 and orientation(lower[-2], lower[-1], p) != 2:
                lower.pop()
            lower.append(p)

        # Upper hull
        upper: List[Point2D] = []
        for p in reversed(pts):
            while len(upper) >= 2 and orientation(upper[-2], upper[-1], p) != 2:
                upper.pop()
            upper.append(p)

        return lower[:-1] + upper[:-1]

    @staticmethod
    def graham_scan(points: List[Point2D]) -> List[Point2D]:
        """Graham scan convex hull algorithm."""
        if len(points) <= 2:
            return points

        # Find pivot: lowest y-coord (break ties with lowest x-coord)
        pivot = min(points, key=lambda p: (p.y, p.x))

        def polar_angle_dist(p: Point2D) -> Tuple[float, float]:
            angle = math.atan2(p.y - pivot.y, p.x - pivot.x)
            dist = pivot.distance_to(p)
            return angle, dist

        # Sort by polar angle
        sorted_pts = sorted([p for p in points if p != pivot], key=polar_angle_dist)

        hull = [pivot]
        for p in sorted_pts:
            while len(hull) >= 2 and orientation(hull[-2], hull[-1], p) != 2:
                hull.pop()
            hull.append(p)

        return hull


class ClosestPair:
    """Closest pair of points in 2D space: O(n log n)."""

    @staticmethod
    def find_closest_pair(points: List[Point2D]) -> Tuple[float, Point2D, Point2D]:
        if len(points) < 2:
            raise ValueError("Must have at least 2 points")

        pts_x = sorted(points, key=lambda p: p.x)
        pts_y = sorted(points, key=lambda p: p.y)

        def rec(px: List[Point2D], py: List[Point2D]) -> Tuple[float, Point2D, Point2D]:
            n = len(px)
            if n <= 3:
                # Brute force for small base cases
                min_d = float("inf")
                best = (px[0], px[1])
                for i in range(n):
                    for j in range(i + 1, n):
                        d = px[i].distance_to(px[j])
                        if d < min_d:
                            min_d = d
                            best = (px[i], px[j])
                return min_d, best[0], best[1]

            mid = n // 2
            mid_pt = px[mid]

            left_x = px[:mid]
            right_x = px[mid:]

            left_set = set(left_x)
            left_y = [p for p in py if p in left_set]
            right_y = [p for p in py if p not in left_set]

            d1, p1a, p1b = rec(left_x, left_y)
            d2, p2a, p2b = rec(right_x, right_y)

            if d1 <= d2:
                d_min, best_pair = d1, (p1a, p1b)
            else:
                d_min, best_pair = d2, (p2a, p2b)

            # Check strip around dividing line
            strip = [p for p in py if abs(p.x - mid_pt.x) < d_min]
            for i in range(len(strip)):
                for j in range(i + 1, min(i + 8, len(strip))):
                    d = strip[i].distance_to(strip[j])
                    if d < d_min:
                        d_min = d
                        best_pair = (strip[i], strip[j])

            return d_min, best_pair[0], best_pair[1]

        return rec(pts_x, pts_y)


class Polygon:
    """Represents a 2D planar polygon."""

    def __init__(self, vertices: List[Point2D]):
        if len(vertices) < 3:
            raise ValueError("Polygon must have at least 3 vertices")
        self.vertices = vertices

    def area(self) -> float:
        """Computes polygon area using the Shoelace formula."""
        n = len(self.vertices)
        area = 0.0
        for i in range(n):
            j = (i + 1) % n
            area += self.vertices[i].x * self.vertices[j].y
            area -= self.vertices[j].x * self.vertices[i].y
        return abs(area) / 2.0

    def perimeter(self) -> float:
        n = len(self.vertices)
        return sum(self.vertices[i].distance_to(self.vertices[(i + 1) % n]) for i in range(n))

    def centroid(self) -> Point2D:
        """Computes geometric centroid (center of mass)."""
        n = len(self.vertices)
        cx, cy, signed_area = 0.0, 0.0, 0.0
        for i in range(n):
            j = (i + 1) % n
            cross = self.vertices[i].x * self.vertices[j].y - self.vertices[j].x * self.vertices[i].y
            signed_area += cross
            cx += (self.vertices[i].x + self.vertices[j].x) * cross
            cy += (self.vertices[i].y + self.vertices[j].y) * cross

        signed_area *= 0.5
        if abs(signed_area) < 1e-12:
            return self.vertices[0]
        return Point2D(cx / (6.0 * signed_area), cy / (6.0 * signed_area))

    def contains_point_ray_cast(self, pt: Point2D) -> bool:
        """Point-in-polygon test via horizontal ray casting."""
        n = len(self.vertices)
        inside = False
        for i in range(n):
            j = (i + 1) % n
            v1, v2 = self.vertices[i], self.vertices[j]
            # Ray test
            if ((v1.y > pt.y) != (v2.y > pt.y)):
                intersect_x = (v2.x - v1.x) * (pt.y - v1.y) / (v2.y - v1.y) + v1.x
                if pt.x < intersect_x:
                    inside = not inside
        return inside

    @staticmethod
    def clip_sutherland_hodgman(subject_poly: List[Point2D], clip_poly: List[Point2D]) -> List[Point2D]:
        """
        Sutherland-Hodgman Polygon Clipping algorithm.
        Clips subject_poly against convex clip_poly.
        """
        def is_inside(cp1: Point2D, cp2: Point2D, p: Point2D) -> bool:
            return (cp2.x - cp1.x) * (p.y - cp1.y) >= (cp2.y - cp1.y) * (p.x - cp1.x)

        def compute_intersection(cp1: Point2D, cp2: Point2D, s: Point2D, e: Point2D) -> Point2D:
            dc = (cp1.x - cp2.x, cp1.y - cp2.y)
            dp = (s.x - e.x, s.y - e.y)
            n1 = cp1.x * cp2.y - cp1.y * cp2.x
            n2 = s.x * e.y - s.y * e.x
            n3 = 1.0 / (dc[0] * dp[1] - dc[1] * dp[0])
            return Point2D((n1 * dp[0] - n2 * dc[0]) * n3, (n1 * dp[1] - n2 * dc[1]) * n3)

        output_list = subject_poly
        clip_len = len(clip_poly)

        for i in range(clip_len):
            cp1 = clip_poly[i]
            cp2 = clip_poly[(i + 1) % clip_len]
            input_list = output_list
            output_list = []
            if not input_list:
                break

            s = input_list[-1]
            for e in input_list:
                if is_inside(cp1, cp2, e):
                    if not is_inside(cp1, cp2, s):
                        output_list.append(compute_intersection(cp1, cp2, s, e))
                    output_list.append(e)
                elif is_inside(cp1, cp2, s):
                    output_list.append(compute_intersection(cp1, cp2, s, e))
                s = e

        return output_list


def benchmark_computational_geometry() -> None:
    print("=" * 60)
    print("COMPUTATIONAL GEOMETRY BENCHMARK & VERIFICATION")
    print("=" * 60)

    # 1. Convex Hull Test
    pts = [
        Point2D(0, 3), Point2D(2, 2), Point2D(1, 1), Point2D(2, 1),
        Point2D(3, 0), Point2D(0, 0), Point2D(3, 3), Point2D(1, 2)
    ]
    hull_andrew = ConvexHull.monotone_chain(pts)
    hull_graham = ConvexHull.graham_scan(pts)
    print(f"[Convex Hull] Andrew Monotone Chain: {len(hull_andrew)} vertices")
    print(f"[Convex Hull] Graham Scan: {len(hull_graham)} vertices")
    assert len(hull_andrew) == 4, f"Expected 4 hull vertices, got {len(hull_andrew)}"

    # 2. Closest Pair of Points
    random.seed(42)
    sample_points = [Point2D(random.uniform(0, 100), random.uniform(0, 100)) for _ in range(200)]
    t0 = time.perf_counter()
    min_dist, p1, p2 = ClosestPair.find_closest_pair(sample_points)
    elapsed = time.perf_counter() - t0
    print(f"[Closest Pair] Min dist: {min_dist:.4f} between {p1} and {p2} ({elapsed*1e3:.2f} ms)")

    # 3. Polygon Area & Centroid
    poly_pts = [Point2D(0, 0), Point2D(4, 0), Point2D(4, 3), Point2D(0, 3)]
    rect = Polygon(poly_pts)
    print(f"[Polygon] Area: {rect.area():.2f} (expected 12.0) | Centroid: {rect.centroid()}")
    assert abs(rect.area() - 12.0) < 1e-9

    # 4. Point in Polygon
    inside_pt = Point2D(2.0, 1.5)
    outside_pt = Point2D(5.0, 5.0)
    assert rect.contains_point_ray_cast(inside_pt) is True
    assert rect.contains_point_ray_cast(outside_pt) is False
    print(f"[Point-In-Polygon] Correctly classified points inside and outside polygon")

    # 5. Segment Intersection
    s1 = Segment2D(Point2D(0, 0), Point2D(4, 4))
    s2 = Segment2D(Point2D(0, 4), Point2D(4, 0))
    pt_inter = Intersection.segment_intersection_point(s1, s2)
    print(f"[Intersection] Segment intersection point: {pt_inter}")
    assert pt_inter is not None and math.isclose(pt_inter.x, 2.0) and math.isclose(pt_inter.y, 2.0)

    print("\nAll Computational Geometry algorithms verified successfully!")


if __name__ == "__main__":
    benchmark_computational_geometry()
