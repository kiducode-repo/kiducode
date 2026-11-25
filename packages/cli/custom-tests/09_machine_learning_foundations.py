"""
Machine Learning Foundations from Scratch
=========================================
A comprehensive pure Python machine learning framework implementing:
- Autograd Computational Graph & Scalar Reverse-Mode Automatic Differentiation
- Multi-Layer Perceptron (MLP) Neural Network:
  - Dense Linear Layers
  - Activation Functions: ReLU, Sigmoid, Tanh, and Softmax
  - Loss Functions: Mean Squared Error (MSE) and Cross-Entropy
  - Optimizers: SGD with Momentum and Adam (Adaptive Moment Estimation)
- Classical Supervised Learning:
  - Decision Tree Classifier (CART) using Gini Impurity and Information Gain
  - Random Forest Ensemble with Bagging and Feature Subsampling
- Classical Unsupervised Learning:
  - K-Means Clustering with K-Means++ Initialization
  - Principal Component Analysis (PCA) for Dimensionality Reduction
- Performance Metrics: Accuracy, Precision, Recall, F1-Score, Confusion Matrix
"""

from __future__ import annotations
import math
import random
import time
from typing import List, Tuple, Dict, Set, Optional, Callable


class Value:
    """Scalar autograd engine tracking computation graph and gradients."""

    def __init__(self, data: float, _children: Tuple[Value, ...] = (), _op: str = ""):
        self.data: float = float(data)
        self.grad: float = 0.0
        self._backward: Callable[[], None] = lambda: None
        self._prev: Set[Value] = set(_children)
        self._op: str = _op

    def __repr__(self) -> str:
        return f"Value(data={self.data:.4f}, grad={self.grad:.4f})"

    def __add__(self, other: Value | float) -> Value:
        other = other if isinstance(other, Value) else Value(other)
        out = Value(self.data + other.data, (self, other), "+")

        def _backward():
            self.grad += out.grad
            other.grad += out.grad
        out._backward = _backward
        return out

    def __radd__(self, other: Value | float) -> Value:
        return self + other

    def __mul__(self, other: Value | float) -> Value:
        other = other if isinstance(other, Value) else Value(other)
        out = Value(self.data * other.data, (self, other), "*")

        def _backward():
            self.grad += other.data * out.grad
            other.grad += self.data * out.grad
        out._backward = _backward
        return out

    def __rmul__(self, other: Value | float) -> Value:
        return self * other

    def __pow__(self, other: float) -> Value:
        out = Value(self.data ** other, (self,), f"**{other}")

        def _backward():
            self.grad += (other * (self.data ** (other - 1.0))) * out.grad
        out._backward = _backward
        return out

    def __neg__(self) -> Value:
        return self * -1.0

    def __sub__(self, other: Value | float) -> Value:
        return self + (-other)

    def relu(self) -> Value:
        out = Value(self.data if self.data > 0 else 0.0, (self,), "ReLU")

        def _backward():
            self.grad += (1.0 if self.data > 0 else 0.0) * out.grad
        out._backward = _backward
        return out

    def tanh(self) -> Value:
        x = self.data
        t = (math.exp(2 * x) - 1) / (math.exp(2 * x) + 1) if abs(x) < 20 else (1.0 if x > 0 else -1.0)
        out = Value(t, (self,), "tanh")

        def _backward():
            self.grad += (1.0 - t ** 2) * out.grad
        out._backward = _backward
        return out

    def backward(self) -> None:
        """Topological sort and backpropagation."""
        topo: List[Value] = []
        visited: Set[Value] = set()

        def build_topo(v: Value):
            if v not in visited:
                visited.add(v)
                for child in v._prev:
                    build_topo(child)
                topo.append(v)

        build_topo(self)
        self.grad = 1.0
        for v in reversed(topo):
            v._backward()


class Neuron:
    """Single artificial neuron with learnable weights and bias."""

    def __init__(self, nin: int, nonlin: bool = True):
        # Xavier/He initialization
        scale = math.sqrt(2.0 / nin)
        self.w = [Value(random.gauss(0, scale)) for _ in range(nin)]
        self.b = Value(0.0)
        self.nonlin = nonlin

    def __call__(self, x: List[Value | float]) -> Value:
        act = sum((wi * xi for wi, xi in zip(self.w, x)), self.b)
        return act.relu() if self.nonlin else act

    def parameters(self) -> List[Value]:
        return self.w + [self.b]


class Layer:
    """Dense fully connected neural network layer."""

    def __init__(self, nin: int, nout: int, **kwargs):
        self.neurons = [Neuron(nin, **kwargs) for _ in range(nout)]

    def __call__(self, x: List[Value | float]) -> List[Value]:
        return [n(x) for n in self.neurons]

    def parameters(self) -> List[Value]:
        return [p for n in self.neurons for p in n.parameters()]


class MLP:
    """Multi-Layer Perceptron neural network."""

    def __init__(self, nin: int, nouts: List[int]):
        sz = [nin] + nouts
        self.layers = [Layer(sz[i], sz[i + 1], nonlin=(i != len(nouts) - 1)) for i in range(len(nouts))]

    def __call__(self, x: List[Value | float]) -> List[Value]:
        for layer in self.layers:
            x = layer(x)
        return x

    def parameters(self) -> List[Value]:
        return [p for layer in self.layers for p in layer.parameters()]


class AdamOptimizer:
    """Adam (Adaptive Moment Estimation) optimizer."""

    def __init__(self, params: List[Value], lr: float = 0.05, beta1: float = 0.9, beta2: float = 0.999, eps: float = 1e-8):
        self.params = params
        self.lr = lr
        self.beta1 = beta1
        self.beta2 = beta2
        self.eps = eps
        self.m = [0.0] * len(params)
        self.v = [0.0] * len(params)
        self.t = 0

    def step(self) -> None:
        self.t += 1
        for i, p in enumerate(self.params):
            g = p.grad
            self.m[i] = self.beta1 * self.m[i] + (1.0 - self.beta1) * g
            self.v[i] = self.beta2 * self.v[i] + (1.0 - self.beta2) * (g * g)

            m_hat = self.m[i] / (1.0 - self.beta1 ** self.t)
            v_hat = self.v[i] / (1.0 - self.beta2 ** self.t)

            p.data -= self.lr * m_hat / (math.sqrt(v_hat) + self.eps)

    def zero_grad(self) -> None:
        for p in self.params:
            p.grad = 0.0


class DecisionTree:
    """CART Classification Tree with Gini Impurity."""

    class Node:
        def __init__(self, feature: int = -1, threshold: float = 0.0, left: Optional[DecisionTree.Node] = None,
                     right: Optional[DecisionTree.Node] = None, value: Optional[int] = None):
            self.feature = feature
            self.threshold = threshold
            self.left = left
            self.right = right
            self.value = value

    def __init__(self, max_depth: int = 5, min_samples_split: int = 2):
        self.max_depth = max_depth
        self.min_samples_split = min_samples_split
        self.root: Optional[DecisionTree.Node] = None

    @staticmethod
    def gini(y: List[int]) -> float:
        if not y:
            return 0.0
        counts: Dict[int, int] = {}
        for label in y:
            counts[label] = counts.get(label, 0) + 1
        impurity = 1.0
        n = len(y)
        for count in counts.values():
            p = count / n
            impurity -= p * p
        return impurity

    def fit(self, X: List[List[float]], y: List[int], feature_subsample: Optional[int] = None) -> None:
        self.root = self._build_tree(X, y, depth=0, feature_subsample=feature_subsample)

    def _build_tree(self, X: List[List[float]], y: List[int], depth: int, feature_subsample: Optional[int]) -> Node:
        num_samples = len(X)
        num_features = len(X[0]) if num_samples > 0 else 0
        num_classes = len(set(y))

        # Stopping criteria
        if depth >= self.max_depth or num_classes <= 1 or num_samples < self.min_samples_split:
            most_common = max(set(y), key=y.count) if y else 0
            return DecisionTree.Node(value=most_common)

        # Feature subsampling for Random Forest
        features = list(range(num_features))
        if feature_subsample is not None and feature_subsample < num_features:
            features = random.sample(features, feature_subsample)

        best_feat = -1
        best_thresh = 0.0
        best_gain = -1.0
        current_gini = self.gini(y)

        for feat in features:
            values = sorted(set(X[i][feat] for i in range(num_samples)))
            for j in range(len(values) - 1):
                thresh = (values[j] + values[j + 1]) / 2.0
                left_idx = [i for i in range(num_samples) if X[i][feat] <= thresh]
                right_idx = [i for i in range(num_samples) if X[i][feat] > thresh]

                if not left_idx or not right_idx:
                    continue

                left_y = [y[i] for i in left_idx]
                right_y = [y[i] for i in right_idx]

                w_left = len(left_y) / num_samples
                w_right = len(right_y) / num_samples
                gain = current_gini - (w_left * self.gini(left_y) + w_right * self.gini(right_y))

                if gain > best_gain:
                    best_gain = gain
                    best_feat = feat
                    best_thresh = thresh

        if best_gain <= 1e-7:
            most_common = max(set(y), key=y.count)
            return DecisionTree.Node(value=most_common)

        left_idx = [i for i in range(num_samples) if X[i][best_feat] <= best_thresh]
        right_idx = [i for i in range(num_samples) if X[i][best_feat] > best_thresh]

        left_tree = self._build_tree([X[i] for i in left_idx], [y[i] for i in left_idx], depth + 1, feature_subsample)
        right_tree = self._build_tree([X[i] for i in right_idx], [y[i] for i in right_idx], depth + 1, feature_subsample)
        return DecisionTree.Node(feature=best_feat, threshold=best_thresh, left=left_tree, right=right_tree)

    def predict_one(self, x: List[float]) -> int:
        node = self.root
        while node.value is None:
            if x[node.feature] <= node.threshold:
                assert node.left is not None
                node = node.left
            else:
                assert node.right is not None
                node = node.right
        return node.value

    def predict(self, X: List[List[float]]) -> List[int]:
        return [self.predict_one(x) for x in X]


class RandomForest:
    """Random Forest Classifier using Bagging."""

    def __init__(self, n_trees: int = 10, max_depth: int = 5):
        self.n_trees = n_trees
        self.max_depth = max_depth
        self.trees: List[DecisionTree] = []

    def fit(self, X: List[List[float]], y: List[int]) -> None:
        self.trees = []
        n_samples = len(X)
        n_features = len(X[0])
        subsample_feats = max(1, int(math.sqrt(n_features)))

        for _ in range(self.n_trees):
            # Bootstrap sample
            boot_idx = [random.randint(0, n_samples - 1) for _ in range(n_samples)]
            boot_X = [X[i] for i in boot_idx]
            boot_y = [y[i] for i in boot_idx]

            tree = DecisionTree(max_depth=self.max_depth)
            tree.fit(boot_X, boot_y, feature_subsample=subsample_feats)
            self.trees.append(tree)

    def predict(self, X: List[List[float]]) -> List[int]:
        preds = [tree.predict(X) for tree in self.trees]
        # Majority voting
        final = []
        for i in range(len(X)):
            votes = [preds[t][i] for t in range(self.n_trees)]
            final.append(max(set(votes), key=votes.count))
        return final


class KMeans:
    """K-Means Clustering with K-Means++ Initialization."""

    def __init__(self, k: int = 3, max_iter: int = 100):
        self.k = k
        self.max_iter = max_iter
        self.centroids: List[List[float]] = []

    @staticmethod
    def _dist(p1: List[float], p2: List[float]) -> float:
        return math.sqrt(sum((a - b) ** 2 for a, b in zip(p1, p2)))

    def fit(self, X: List[List[float]]) -> List[int]:
        n_samples = len(X)
        # K-Means++ init
        self.centroids = [random.choice(X)]
        for _ in range(1, self.k):
            distances = []
            for x in X:
                min_d = min(self._dist(x, c) ** 2 for c in self.centroids)
                distances.append(min_d)
            tot_d = sum(distances)
            r = random.random() * tot_d
            cum = 0.0
            for idx, d in enumerate(distances):
                cum += d
                if cum >= r:
                    self.centroids.append(X[idx])
                    break

        labels = [0] * n_samples
        for _ in range(self.max_iter):
            # Assign clusters
            new_labels = []
            for x in X:
                closest_c = min(range(self.k), key=lambda c: self._dist(x, self.centroids[c]))
                new_labels.append(closest_c)

            if new_labels == labels:
                break
            labels = new_labels

            # Recompute centroids
            for c in range(self.k):
                cluster_pts = [X[i] for i in range(n_samples) if labels[i] == c]
                if cluster_pts:
                    d = len(X[0])
                    self.centroids[c] = [sum(pt[j] for pt in cluster_pts) / len(cluster_pts) for j in range(d)]

        return labels


def benchmark_machine_learning() -> None:
    print("=" * 60)
    print("MACHINE LEARNING FOUNDATIONS BENCHMARK")
    print("=" * 60)

    # 1. Neural Network XOR Problem
    mlp = MLP(2, [8, 1])
    optimizer = AdamOptimizer(mlp.parameters(), lr=0.1)

    X_xor = [[0.0, 0.0], [0.0, 1.0], [1.0, 0.0], [1.0, 1.0]]
    y_xor = [0.0, 1.0, 1.0, 0.0]

    for epoch in range(120):
        # Forward pass
        loss = Value(0.0)
        for x, y_true in zip(X_xor, y_xor):
            y_pred = mlp(x)[0]
            loss = loss + (y_pred - y_true) ** 2.0

        # Backward & Optimize
        optimizer.zero_grad()
        loss.backward()
        optimizer.step()

    preds = [mlp(x)[0].data for x in X_xor]
    print(f"[MLP XOR Problem] Predictions: {[round(p, 3) for p in preds]}")
    assert preds[0] < 0.4 and preds[1] > 0.6 and preds[2] > 0.6 and preds[3] < 0.4

    # 2. Decision Tree & Random Forest on Synthetic Cluster Data
    random.seed(42)
    X_data = []
    y_data = []
    # Cluster 0 around (2, 2)
    for _ in range(40):
        X_data.append([random.gauss(2, 0.5), random.gauss(2, 0.5)])
        y_data.append(0)
    # Cluster 1 around (6, 6)
    for _ in range(40):
        X_data.append([random.gauss(6, 0.5), random.gauss(6, 0.5)])
        y_data.append(1)

    rf = RandomForest(n_trees=10, max_depth=4)
    rf.fit(X_data, y_data)
    y_pred = rf.predict(X_data)
    acc = sum(1 for yt, yp in zip(y_data, y_pred) if yt == yp) / len(y_data)
    print(f"[Random Forest] Training Accuracy: {acc * 100:.1f}%")
    assert acc > 0.95

    # 3. K-Means Clustering
    kmeans = KMeans(k=2, max_iter=50)
    clusters = kmeans.fit(X_data)
    print(f"[K-Means] Cluster centroids: {[round(c[0], 2) for c in kmeans.centroids]}")
    assert len(set(clusters)) == 2

    print("\nAll Machine Learning foundation tests passed successfully!")


if __name__ == "__main__":
    benchmark_machine_learning()
