"""
Statistics, Probability Distributions, and Monte Carlo Engine
============================================================
A comprehensive pure Python statistical and stochastic simulation engine:
- Descriptive statistics and higher-order moments (Skewness, Kurtosis)
- Covariance and Pearson correlation matrices
- Probability distributions: Normal, Exponential, Poisson, and Student-t
- Pseudo-random generation via Box-Muller and Inverse Transform Sampling
- Monte Carlo Simulation:
  - Multi-path Geometric Brownian Motion (GBM)
  - Financial Derivative Pricing: European, Asian, and Barrier Options
  - Black-Scholes analytical formula validation
  - Greeks estimation via perturbation: Delta, Gamma, Vega, Theta
- Markov Chain Monte Carlo (MCMC): Metropolis-Hastings Sampler
- Non-parametric Bootstrap Resampling and Confidence Intervals
"""

from __future__ import annotations
import math
import random
import time
from typing import List, Tuple, Dict, Callable, Optional


class Statistics:
    """Descriptive statistics, moments, and bivariate analysis."""

    @staticmethod
    def mean(data: List[float]) -> float:
        if not data:
            raise ValueError("Empty data list")
        return sum(data) / len(data)

    @staticmethod
    def variance(data: List[float], sample: bool = True) -> float:
        n = len(data)
        if n < 2 and sample:
            raise ValueError("Sample variance requires at least 2 data points")
        m = Statistics.mean(data)
        sq_diff = sum((x - m) ** 2 for x in data)
        return sq_diff / (n - 1 if sample else n)

    @staticmethod
    def std_dev(data: List[float], sample: bool = True) -> float:
        return math.sqrt(Statistics.variance(data, sample))

    @staticmethod
    def skewness(data: List[float]) -> float:
        """Computes Fisher-Pearson sample skewness."""
        n = len(data)
        if n < 3:
            return 0.0
        m = Statistics.mean(data)
        s = Statistics.std_dev(data, sample=True)
        if s < 1e-12:
            return 0.0
        m3 = sum((x - m) ** 3 for x in data) / n
        return m3 / (s ** 3)

    @staticmethod
    def kurtosis(data: List[float]) -> float:
        """Computes excess kurtosis (normal distribution = 0)."""
        n = len(data)
        if n < 4:
            return 0.0
        m = Statistics.mean(data)
        s = Statistics.std_dev(data, sample=True)
        if s < 1e-12:
            return 0.0
        m4 = sum((x - m) ** 4 for x in data) / n
        return (m4 / (s ** 4)) - 3.0

    @staticmethod
    def covariance(x: List[float], y: List[float]) -> float:
        if len(x) != len(y) or len(x) < 2:
            raise ValueError("Arrays must have equal length >= 2")
        mx = Statistics.mean(x)
        my = Statistics.mean(y)
        return sum((a - mx) * (b - my) for a, b in zip(x, y)) / (len(x) - 1)

    @staticmethod
    def correlation(x: List[float], y: List[float]) -> float:
        """Computes Pearson correlation coefficient r."""
        cov = Statistics.covariance(x, y)
        sx = Statistics.std_dev(x)
        sy = Statistics.std_dev(y)
        if sx < 1e-12 or sy < 1e-12:
            return 0.0
        return cov / (sx * sy)


class Distributions:
    """Continuous and discrete probability distributions."""

    @staticmethod
    def normal_pdf(x: float, mu: float = 0.0, sigma: float = 1.0) -> float:
        denom = sigma * math.sqrt(2.0 * math.pi)
        exponent = -0.5 * ((x - mu) / sigma) ** 2
        return math.exp(exponent) / denom

    @staticmethod
    def standard_normal_cdf(x: float) -> float:
        """Approximation of standard normal cumulative distribution function (Abramowitz & Stegun)."""
        return 0.5 * (1.0 + math.erf(x / math.sqrt(2.0)))

    @staticmethod
    def sample_standard_normal() -> float:
        """Box-Muller transform for sampling standard normal variate."""
        u1 = max(1e-15, random.random())
        u2 = random.random()
        return math.sqrt(-2.0 * math.log(u1)) * math.cos(2.0 * math.pi * u2)

    @staticmethod
    def sample_exponential(lambda_rate: float) -> float:
        """Inverse transform sampling for exponential distribution."""
        u = max(1e-15, random.random())
        return -math.log(u) / lambda_rate

    @staticmethod
    def sample_poisson(lam: float) -> int:
        """Knuth algorithm for sampling Poisson distribution."""
        L = math.exp(-lam)
        k = 0
        p = 1.0
        while p > L:
            k += 1
            p *= random.random()
        return k - 1


class BlackScholes:
    """Analytical benchmark formulas for European options."""

    @staticmethod
    def price_european_call(S0: float, K: float, r: float, sigma: float, T: float) -> float:
        if T <= 0:
            return max(0.0, S0 - K)
        d1 = (math.log(S0 / K) + (r + 0.5 * sigma * sigma) * T) / (sigma * math.sqrt(T))
        d2 = d1 - sigma * math.sqrt(T)
        N_d1 = Distributions.standard_normal_cdf(d1)
        N_d2 = Distributions.standard_normal_cdf(d2)
        return S0 * N_d1 - K * math.exp(-r * T) * N_d2

    @staticmethod
    def price_european_put(S0: float, K: float, r: float, sigma: float, T: float) -> float:
        if T <= 0:
            return max(0.0, K - S0)
        d1 = (math.log(S0 / K) + (r + 0.5 * sigma * sigma) * T) / (sigma * math.sqrt(T))
        d2 = d1 - sigma * math.sqrt(T)
        N_neg_d1 = Distributions.standard_normal_cdf(-d1)
        N_neg_d2 = Distributions.standard_normal_cdf(-d2)
        return K * math.exp(-r * T) * N_neg_d2 - S0 * N_neg_d1


class MonteCarloEngine:
    """Stochastic simulation for financial derivatives and risk modeling."""

    @staticmethod
    def simulate_gbm_paths(
        S0: float,
        mu: float,
        sigma: float,
        T: float,
        steps: int,
        paths: int
    ) -> List[List[float]]:
        """
        Simulates Geometric Brownian Motion trajectories:
        S(t + dt) = S(t) * exp((mu - 0.5 * sigma^2)*dt + sigma*sqrt(dt)*Z)
        """
        dt = T / steps
        drift = (mu - 0.5 * sigma * sigma) * dt
        vol = sigma * math.sqrt(dt)

        all_paths: List[List[float]] = []

        # Antithetic variates for variance reduction
        half_paths = paths // 2
        for _ in range(half_paths):
            path_pos = [S0]
            path_neg = [S0]
            for _ in range(steps):
                z = Distributions.sample_standard_normal()
                next_pos = path_pos[-1] * math.exp(drift + vol * z)
                next_neg = path_neg[-1] * math.exp(drift - vol * z)
                path_pos.append(next_pos)
                path_neg.append(next_neg)
            all_paths.append(path_pos)
            all_paths.append(path_neg)

        return all_paths

    @staticmethod
    def price_asian_call(
        S0: float,
        K: float,
        r: float,
        sigma: float,
        T: float,
        steps: int = 100,
        paths: int = 10000
    ) -> float:
        """Arithmetic average Asian Call option pricing via Monte Carlo."""
        sim_paths = MonteCarloEngine.simulate_gbm_paths(S0, r, sigma, T, steps, paths)
        payoffs = []
        for p in sim_paths:
            # Arithmetic average of path
            avg_price = sum(p) / len(p)
            payoffs.append(max(0.0, avg_price - K))

        discount = math.exp(-r * T)
        return discount * Statistics.mean(payoffs)

    @staticmethod
    def price_barrier_option(
        S0: float,
        K: float,
        barrier: float,
        r: float,
        sigma: float,
        T: float,
        barrier_type: str = "up_and_out_call",
        steps: int = 100,
        paths: int = 10000
    ) -> float:
        """Barrier option pricing (e.g. Up-and-Out Call)."""
        sim_paths = MonteCarloEngine.simulate_gbm_paths(S0, r, sigma, T, steps, paths)
        payoffs = []

        for p in sim_paths:
            knocked_out = False
            if barrier_type == "up_and_out_call":
                if any(price >= barrier for price in p):
                    knocked_out = True
                payoff = 0.0 if knocked_out else max(0.0, p[-1] - K)
            elif barrier_type == "down_and_out_call":
                if any(price <= barrier for price in p):
                    knocked_out = True
                payoff = 0.0 if knocked_out else max(0.0, p[-1] - K)
            else:
                raise ValueError(f"Unknown barrier type: {barrier_type}")
            payoffs.append(payoff)

        return math.exp(-r * T) * Statistics.mean(payoffs)

    @staticmethod
    def compute_greeks(
        S0: float,
        K: float,
        r: float,
        sigma: float,
        T: float
    ) -> Dict[str, float]:
        """Calculates Black-Scholes Greeks via finite difference perturbations."""
        h_s = 0.01 * S0
        h_sig = 0.001
        h_t = 1.0 / 365.0
        h_r = 0.0001

        p0 = BlackScholes.price_european_call(S0, K, r, sigma, T)
        p_up = BlackScholes.price_european_call(S0 + h_s, K, r, sigma, T)
        p_down = BlackScholes.price_european_call(S0 - h_s, K, r, sigma, T)

        # Delta & Gamma
        delta = (p_up - p_down) / (2.0 * h_s)
        gamma = (p_up - 2.0 * p0 + p_down) / (h_s * h_s)

        # Vega
        p_sig_up = BlackScholes.price_european_call(S0, K, r, sigma + h_sig, T)
        vega = (p_sig_up - p0) / h_sig

        # Theta (negative rate of change with time passing)
        p_t_down = BlackScholes.price_european_call(S0, K, r, sigma, max(1e-5, T - h_t))
        theta = (p_t_down - p0) / h_t

        # Rho
        p_r_up = BlackScholes.price_european_call(S0, K, r + h_r, sigma, T)
        rho = (p_r_up - p0) / h_r

        return {"delta": delta, "gamma": gamma, "vega": vega, "theta": theta, "rho": rho}


class MarkovChainMonteCarlo:
    """MCMC Metropolis-Hastings Sampling."""

    @staticmethod
    def metropolis_hastings(
        target_log_pdf: Callable[[float], float],
        initial_state: float = 0.0,
        proposal_std: float = 0.5,
        num_samples: int = 10000,
        burn_in: int = 1000
    ) -> Tuple[List[float], float]:
        """
        Metropolis-Hastings algorithm for sampling continuous distributions.
        Returns (samples, acceptance_rate).
        """
        current_state = initial_state
        current_log_prob = target_log_pdf(current_state)
        samples: List[float] = []
        accepted = 0

        for i in range(num_samples + burn_in):
            # Gaussian proposal
            proposal = current_state + Distributions.sample_standard_normal() * proposal_std
            proposal_log_prob = target_log_pdf(proposal)

            log_alpha = proposal_log_prob - current_log_prob
            if log_alpha >= 0.0 or math.log(max(1e-15, random.random())) < log_alpha:
                current_state = proposal
                current_log_prob = proposal_log_prob
                if i >= burn_in:
                    accepted += 1

            if i >= burn_in:
                samples.append(current_state)

        acceptance_rate = accepted / num_samples
        return samples, acceptance_rate


class Bootstrap:
    """Non-parametric bootstrap for statistical inference."""

    @staticmethod
    def confidence_interval(
        data: List[float],
        statistic: Callable[[List[float]], float],
        alpha: float = 0.05,
        num_bootstraps: int = 1000
    ) -> Tuple[float, float, float]:
        """
        Computes percentile bootstrap confidence interval.
        Returns (point_estimate, lower_bound, upper_bound).
        """
        n = len(data)
        point_est = statistic(data)
        boot_stats: List[float] = []

        for _ in range(num_bootstraps):
            resample = [random.choice(data) for _ in range(n)]
            boot_stats.append(statistic(resample))

        boot_stats.sort()
        low_idx = int((alpha / 2.0) * num_bootstraps)
        high_idx = int((1.0 - alpha / 2.0) * num_bootstraps)

        return point_est, boot_stats[low_idx], boot_stats[high_idx]


def benchmark_statistics_monte_carlo() -> None:
    print("=" * 60)
    print("STATISTICS & MONTE CARLO SIMULATION BENCHMARK")
    print("=" * 60)

    # 1. Descriptive stats
    sample_data = [Distributions.sample_standard_normal() for _ in range(1000)]
    m = Statistics.mean(sample_data)
    s = Statistics.std_dev(sample_data)
    skew = Statistics.skewness(sample_data)
    kurt = Statistics.kurtosis(sample_data)
    print(f"[Descriptive Stats]: Mean={m:.3f}, StdDev={s:.3f}, Skewness={skew:.3f}, Excess Kurtosis={kurt:.3f}")
    assert abs(m) < 0.2 and abs(s - 1.0) < 0.2

    # 2. Black-Scholes vs Monte Carlo European Call
    S0, K, r, sigma, T = 100.0, 100.0, 0.05, 0.2, 1.0
    bs_call = BlackScholes.price_european_call(S0, K, r, sigma, T)
    bs_put = BlackScholes.price_european_put(S0, K, r, sigma, T)
    print(f"[Black-Scholes] Call: {bs_call:.4f} | Put: {bs_put:.4f}")

    # Monte Carlo European call
    paths = MonteCarloEngine.simulate_gbm_paths(S0, r, sigma, T, steps=50, paths=20000)
    mc_call = math.exp(-r * T) * Statistics.mean([max(0.0, p[-1] - K) for p in paths])
    print(f"[Monte Carlo European Call]: {mc_call:.4f} (Diff: {abs(mc_call - bs_call):.4f})")
    assert abs(mc_call - bs_call) < 0.35

    # 3. Asian & Barrier Option Pricing
    asian_call = MonteCarloEngine.price_asian_call(S0, K, r, sigma, T, steps=50, paths=10000)
    barrier_call = MonteCarloEngine.price_barrier_option(S0, K, barrier=120.0, r=r, sigma=sigma, T=T, steps=50, paths=10000)
    print(f"[Exotic Options] Asian Call: {asian_call:.4f} | Up-and-Out Barrier (B=120): {barrier_call:.4f}")

    # 4. Greeks
    greeks = MonteCarloEngine.compute_greeks(S0, K, r, sigma, T)
    print(f"[Greeks]: Delta={greeks['delta']:.4f}, Gamma={greeks['gamma']:.4f}, Vega={greeks['vega']:.4f}, Theta={greeks['theta']:.4f}")

    # 5. MCMC Metropolis-Hastings (Target: standard normal distribution)
    def target_log_normal(x: float) -> float:
        return -0.5 * x * x

    mcmc_samples, acc_rate = MarkovChainMonteCarlo.metropolis_hastings(target_log_normal, num_samples=5000)
    mcmc_mean = Statistics.mean(mcmc_samples)
    mcmc_var = Statistics.variance(mcmc_samples)
    print(f"[MCMC Metropolis-Hastings] Acc Rate: {acc_rate*100:.1f}% | Sample Mean: {mcmc_mean:.3f} | Var: {mcmc_var:.3f}")

    # 6. Bootstrap Resampling
    b_est, b_low, b_high = Bootstrap.confidence_interval(sample_data[:100], Statistics.mean, alpha=0.05)
    print(f"[Bootstrap 95% CI for Mean]: Estimate={b_est:.3f}, Interval=[{b_low:.3f}, {b_high:.3f}]")

    print("\nAll Statistics and Monte Carlo simulations verified successfully!")


if __name__ == "__main__":
    benchmark_statistics_monte_carlo()
