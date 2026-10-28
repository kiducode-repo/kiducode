"""
Symbolic Mathematics & Automatic Differentiation Engine
=======================================================
A pure Python symbolic algebra system and AST engine implementing:
- Abstract Syntax Tree (AST) for symbolic mathematical expressions
- Lexer and Operator-Precedence Recursive Descent Parser
- Symbolic Differentiation with Chain, Product, Quotient, and Power Rules
- Advanced Algebraic Simplification and Constant Folding Engine
- High-order derivative computation
- Symbolic Taylor Series expansion generator
- Newton-Raphson numerical root finding using symbolic derivatives
- LaTeX expression serialization
"""

from __future__ import annotations
import math
import re
from typing import Dict, List, Optional, Union


class Expr:
    """Base abstract class for all symbolic expressions."""

    def diff(self, var: str) -> Expr:
        """Computes symbolic derivative with respect to var."""
        raise NotImplementedError

    def simplify(self) -> Expr:
        """Applies algebraic simplification rules."""
        return self

    def eval(self, env: Dict[str, float]) -> float:
        """Numerically evaluates expression with variable substitutions."""
        raise NotImplementedError

    def to_latex(self) -> str:
        """Converts expression to LaTeX representation."""
        raise NotImplementedError

    def __add__(self, other: Union[Expr, float, int]) -> Expr:
        return Add(self, _to_expr(other)).simplify()

    def __radd__(self, other: Union[Expr, float, int]) -> Expr:
        return Add(_to_expr(other), self).simplify()

    def __sub__(self, other: Union[Expr, float, int]) -> Expr:
        return Sub(self, _to_expr(other)).simplify()

    def __rsub__(self, other: Union[Expr, float, int]) -> Expr:
        return Sub(_to_expr(other), self).simplify()

    def __mul__(self, other: Union[Expr, float, int]) -> Expr:
        return Mul(self, _to_expr(other)).simplify()

    def __rmul__(self, other: Union[Expr, float, int]) -> Expr:
        return Mul(_to_expr(other), self).simplify()

    def __truediv__(self, other: Union[Expr, float, int]) -> Expr:
        return Div(self, _to_expr(other)).simplify()

    def __rtruediv__(self, other: Union[Expr, float, int]) -> Expr:
        return Div(_to_expr(other), self).simplify()

    def __pow__(self, other: Union[Expr, float, int]) -> Expr:
        return Pow(self, _to_expr(other)).simplify()

    def __neg__(self) -> Expr:
        return Mul(Const(-1), self).simplify()


def _to_expr(val: Union[Expr, float, int]) -> Expr:
    if isinstance(val, Expr):
        return val
    return Const(float(val))


class Const(Expr):
    """Represents a numeric constant."""

    def __init__(self, value: float):
        self.val = float(value)

    def __repr__(self) -> str:
        if self.val.is_integer():
            return str(int(self.val))
        return f"{self.val:.4g}"

    def diff(self, var: str) -> Expr:
        return Const(0.0)

    def eval(self, env: Dict[str, float]) -> float:
        return self.val

    def to_latex(self) -> str:
        return str(self)


class Var(Expr):
    """Represents a symbolic variable."""

    def __init__(self, name: str):
        self.name = name

    def __repr__(self) -> str:
        return self.name

    def diff(self, var: str) -> Expr:
        return Const(1.0) if self.name == var else Const(0.0)

    def eval(self, env: Dict[str, float]) -> float:
        if self.name not in env:
            raise KeyError(f"Variable '{self.name}' not provided in environment")
        return env[self.name]

    def to_latex(self) -> str:
        return self.name


class Add(Expr):
    """Addition: left + right."""

    def __init__(self, left: Expr, right: Expr):
        self.left = left
        self.right = right

    def __repr__(self) -> str:
        return f"({self.left} + {self.right})"

    def diff(self, var: str) -> Expr:
        return Add(self.left.diff(var), self.right.diff(var)).simplify()

    def eval(self, env: Dict[str, float]) -> float:
        return self.left.eval(env) + self.right.eval(env)

    def simplify(self) -> Expr:
        l = self.left.simplify()
        r = self.right.simplify()
        if isinstance(l, Const) and isinstance(r, Const):
            return Const(l.val + r.val)
        if isinstance(l, Const) and l.val == 0.0:
            return r
        if isinstance(r, Const) and r.val == 0.0:
            return l
        return Add(l, r)

    def to_latex(self) -> str:
        return f"{self.left.to_latex()} + {self.right.to_latex()}"


class Sub(Expr):
    """Subtraction: left - right."""

    def __init__(self, left: Expr, right: Expr):
        self.left = left
        self.right = right

    def __repr__(self) -> str:
        return f"({self.left} - {self.right})"

    def diff(self, var: str) -> Expr:
        return Sub(self.left.diff(var), self.right.diff(var)).simplify()

    def eval(self, env: Dict[str, float]) -> float:
        return self.left.eval(env) - self.right.eval(env)

    def simplify(self) -> Expr:
        l = self.left.simplify()
        r = self.right.simplify()
        if isinstance(l, Const) and isinstance(r, Const):
            return Const(l.val - r.val)
        if isinstance(r, Const) and r.val == 0.0:
            return l
        return Sub(l, r)

    def to_latex(self) -> str:
        return f"{self.left.to_latex()} - {self.right.to_latex()}"


class Mul(Expr):
    """Multiplication: left * right."""

    def __init__(self, left: Expr, right: Expr):
        self.left = left
        self.right = right

    def __repr__(self) -> str:
        return f"({self.left} * {self.right})"

    def diff(self, var: str) -> Expr:
        # Product Rule: (u*v)' = u'*v + u*v'
        return Add(
            Mul(self.left.diff(var), self.right),
            Mul(self.left, self.right.diff(var))
        ).simplify()

    def eval(self, env: Dict[str, float]) -> float:
        return self.left.eval(env) * self.right.eval(env)

    def simplify(self) -> Expr:
        l = self.left.simplify()
        r = self.right.simplify()
        if isinstance(l, Const) and isinstance(r, Const):
            return Const(l.val * r.val)
        if isinstance(l, Const) and l.val == 0.0:
            return Const(0.0)
        if isinstance(r, Const) and r.val == 0.0:
            return Const(0.0)
        if isinstance(l, Const) and l.val == 1.0:
            return r
        if isinstance(r, Const) and r.val == 1.0:
            return l
        return Mul(l, r)

    def to_latex(self) -> str:
        return f"{self.left.to_latex()} \\cdot {self.right.to_latex()}"


class Div(Expr):
    """Division: left / right."""

    def __init__(self, left: Expr, right: Expr):
        self.left = left
        self.right = right

    def __repr__(self) -> str:
        return f"({self.left} / {self.right})"

    def diff(self, var: str) -> Expr:
        # Quotient Rule: (u/v)' = (u'*v - u*v') / (v^2)
        numerator = Sub(
            Mul(self.left.diff(var), self.right),
            Mul(self.left, self.right.diff(var))
        )
        denominator = Pow(self.right, Const(2.0))
        return Div(numerator, denominator).simplify()

    def eval(self, env: Dict[str, float]) -> float:
        denom = self.right.eval(env)
        if abs(denom) < 1e-15:
            raise ZeroDivisionError("Division by zero in symbolic eval")
        return self.left.eval(env) / denom

    def simplify(self) -> Expr:
        l = self.left.simplify()
        r = self.right.simplify()
        if isinstance(l, Const) and isinstance(r, Const):
            return Const(l.val / r.val)
        if isinstance(l, Const) and l.val == 0.0:
            return Const(0.0)
        if isinstance(r, Const) and r.val == 1.0:
            return l
        return Div(l, r)

    def to_latex(self) -> str:
        return f"\\frac{{{self.left.to_latex()}}}{{{self.right.to_latex()}}}"


class Pow(Expr):
    """Power: base ^ exponent."""

    def __init__(self, base: Expr, exp: Expr):
        self.base = base
        self.exp = exp

    def __repr__(self) -> str:
        return f"({self.base} ^ {self.exp})"

    def diff(self, var: str) -> Expr:
        # Generalized power rule: d/dx [u^v] = u^v * (v' * ln(u) + v * u'/u)
        if isinstance(self.exp, Const):
            # Constant power rule: n * u^(n-1) * u'
            n = self.exp.val
            return Mul(
                Mul(Const(n), Pow(self.base, Const(n - 1.0))),
                self.base.diff(var)
            ).simplify()

        return Mul(
            self,
            Add(
                Mul(self.exp.diff(var), Ln(self.base)),
                Mul(self.exp, Div(self.base.diff(var), self.base))
            )
        ).simplify()

    def eval(self, env: Dict[str, float]) -> float:
        return self.base.eval(env) ** self.exp.eval(env)

    def simplify(self) -> Expr:
        b = self.base.simplify()
        e = self.exp.simplify()
        if isinstance(e, Const) and e.val == 0.0:
            return Const(1.0)
        if isinstance(e, Const) and e.val == 1.0:
            return b
        if isinstance(b, Const) and isinstance(e, Const):
            return Const(b.val ** e.val)
        return Pow(b, e)

    def to_latex(self) -> str:
        return f"{{{self.base.to_latex()}}}^{{{self.exp.to_latex()}}}"


class Sin(Expr):
    def __init__(self, arg: Expr):
        self.arg = arg

    def __repr__(self) -> str:
        return f"sin({self.arg})"

    def diff(self, var: str) -> Expr:
        return Mul(Cos(self.arg), self.arg.diff(var)).simplify()

    def eval(self, env: Dict[str, float]) -> float:
        return math.sin(self.arg.eval(env))

    def simplify(self) -> Expr:
        a = self.arg.simplify()
        if isinstance(a, Const) and a.val == 0.0:
            return Const(0.0)
        return Sin(a)

    def to_latex(self) -> str:
        return f"\\sin({self.arg.to_latex()})"


class Cos(Expr):
    def __init__(self, arg: Expr):
        self.arg = arg

    def __repr__(self) -> str:
        return f"cos({self.arg})"

    def diff(self, var: str) -> Expr:
        return Mul(Mul(Const(-1.0), Sin(self.arg)), self.arg.diff(var)).simplify()

    def eval(self, env: Dict[str, float]) -> float:
        return math.cos(self.arg.eval(env))

    def simplify(self) -> Expr:
        a = self.arg.simplify()
        if isinstance(a, Const) and a.val == 0.0:
            return Const(1.0)
        return Cos(a)

    def to_latex(self) -> str:
        return f"\\cos({self.arg.to_latex()})"


class Exp(Expr):
    def __init__(self, arg: Expr):
        self.arg = arg

    def __repr__(self) -> str:
        return f"exp({self.arg})"

    def diff(self, var: str) -> Expr:
        return Mul(Exp(self.arg), self.arg.diff(var)).simplify()

    def eval(self, env: Dict[str, float]) -> float:
        return math.exp(self.arg.eval(env))

    def simplify(self) -> Expr:
        a = self.arg.simplify()
        if isinstance(a, Const) and a.val == 0.0:
            return Const(1.0)
        return Exp(a)

    def to_latex(self) -> str:
        return f"e^{{{self.arg.to_latex()}}}"


class Ln(Expr):
    def __init__(self, arg: Expr):
        self.arg = arg

    def __repr__(self) -> str:
        return f"ln({self.arg})"

    def diff(self, var: str) -> Expr:
        return Div(self.arg.diff(var), self.arg).simplify()

    def eval(self, env: Dict[str, float]) -> float:
        val = self.arg.eval(env)
        if val <= 0:
            raise ValueError("Logarithm of non-positive number")
        return math.log(val)

    def simplify(self) -> Expr:
        a = self.arg.simplify()
        if isinstance(a, Const) and a.val == 1.0:
            return Const(0.0)
        return Ln(a)

    def to_latex(self) -> str:
        return f"\\ln({self.arg.to_latex()})"


class ExpressionParser:
    """Recursive-descent parser for mathematical expressions."""

    TOKEN_SPECIFICATION = [
        ("NUMBER", r"\d+(\.\d*)?"),
        ("IDENT", r"[a-zA-Z_][a-zA-Z0-9_]*"),
        ("PLUS", r"\+"),
        ("MINUS", r"-"),
        ("MUL", r"\*"),
        ("DIV", r"/"),
        ("POW", r"\^"),
        ("LPAREN", r"\("),
        ("RPAREN", r"\)"),
        ("COMMA", r","),
        ("SKIP", r"[ \t]+"),
    ]

    def __init__(self, text: str):
        self.tokens: List[Tuple[str, str]] = []
        regex = "|".join(f"(?P<{pair[0]}>{pair[1]})" for pair in self.TOKEN_SPECIFICATION)
        for mo in re.finditer(regex, text):
            kind = mo.lastgroup
            val = mo.group()
            if kind != "SKIP":
                assert kind is not None
                self.tokens.append((kind, val))
        self.pos = 0

    def peek(self) -> Optional[Tuple[str, str]]:
        return self.tokens[self.pos] if self.pos < len(self.tokens) else None

    def match(self, expected_type: str) -> str:
        token = self.peek()
        if token and token[0] == expected_type:
            self.pos += 1
            return token[1]
        raise SyntaxError(f"Expected {expected_type}, got {token}")

    def parse(self) -> Expr:
        expr = self._parse_add_sub()
        if self.pos < len(self.tokens):
            raise SyntaxError(f"Unexpected token at position {self.pos}: {self.tokens[self.pos]}")
        return expr

    def _parse_add_sub(self) -> Expr:
        expr = self._parse_mul_div()
        while True:
            tok = self.peek()
            if tok and tok[0] == "PLUS":
                self.match("PLUS")
                expr = Add(expr, self._parse_mul_div()).simplify()
            elif tok and tok[0] == "MINUS":
                self.match("MINUS")
                expr = Sub(expr, self._parse_mul_div()).simplify()
            else:
                break
        return expr

    def _parse_mul_div(self) -> Expr:
        expr = self._parse_power()
        while True:
            tok = self.peek()
            if tok and tok[0] == "MUL":
                self.match("MUL")
                expr = Mul(expr, self._parse_power()).simplify()
            elif tok and tok[0] == "DIV":
                self.match("DIV")
                expr = Div(expr, self._parse_power()).simplify()
            else:
                break
        return expr

    def _parse_power(self) -> Expr:
        expr = self._parse_atom()
        tok = self.peek()
        if tok and tok[0] == "POW":
            self.match("POW")
            expr = Pow(expr, self._parse_power()).simplify()  # Right-associative
        return expr

    def _parse_atom(self) -> Expr:
        tok = self.peek()
        if not tok:
            raise SyntaxError("Unexpected end of expression")

        if tok[0] == "MINUS":
            self.match("MINUS")
            return Mul(Const(-1.0), self._parse_atom()).simplify()

        if tok[0] == "NUMBER":
            val = float(self.match("NUMBER"))
            return Const(val)

        if tok[0] == "LPAREN":
            self.match("LPAREN")
            expr = self._parse_add_sub()
            self.match("RPAREN")
            return expr

        if tok[0] == "IDENT":
            name = self.match("IDENT")
            next_tok = self.peek()
            if next_tok and next_tok[0] == "LPAREN":
                # Function call
                self.match("LPAREN")
                arg = self._parse_add_sub()
                self.match("RPAREN")
                if name == "sin": return Sin(arg).simplify()
                elif name == "cos": return Cos(arg).simplify()
                elif name == "exp": return Exp(arg).simplify()
                elif name == "ln": return Ln(arg).simplify()
                else: raise ValueError(f"Unknown function '{name}'")
            return Var(name)

        raise SyntaxError(f"Unexpected token: {tok}")


class CalculusTools:
    """High-order calculus and numerical root finding."""

    @staticmethod
    def higher_derivative(expr: Expr, var: str, order: int) -> Expr:
        res = expr
        for _ in range(order):
            res = res.diff(var).simplify()
        return res

    @staticmethod
    def taylor_series(expr: Expr, var: str, center: float, degree: int) -> Expr:
        """Generates Taylor series polynomial around center up to specified degree."""
        terms: List[Expr] = []
        fact = 1.0

        for n in range(degree + 1):
            if n > 0:
                fact *= n
            nth_deriv = CalculusTools.higher_derivative(expr, var, n)
            coeff = nth_deriv.eval({var: center}) / fact
            if abs(coeff) > 1e-12:
                if n == 0:
                    terms.append(Const(coeff))
                else:
                    poly_term = Pow(Sub(Var(var), Const(center)), Const(float(n)))
                    terms.append(Mul(Const(coeff), poly_term))

        result: Expr = Const(0.0)
        for t in terms:
            result = Add(result, t).simplify()
        return result

    @staticmethod
    def newton_raphson_solve(
        expr: Expr,
        var: str,
        x0: float,
        tol: float = 1e-10,
        max_iter: int = 100
    ) -> float:
        """Solves f(x) = 0 using exact symbolic derivative."""
        d_expr = expr.diff(var).simplify()
        x = x0

        for _ in range(max_iter):
            fx = expr.eval({var: x})
            if abs(fx) < tol:
                return x
            dfx = d_expr.eval({var: x})
            if abs(dfx) < 1e-14:
                raise ZeroDivisionError("Derivative vanished during Newton-Raphson iteration")
            x = x - fx / dfx

        return x


def benchmark_symbolic_differentiation() -> None:
    print("=" * 60)
    print("SYMBOLIC DIFFERENTIATION & AST ENGINE BENCHMARK")
    print("=" * 60)

    # 1. Parsing expressions
    expr_str = "x^3 + sin(x) * exp(x)"
    parser = ExpressionParser(expr_str)
    ast = parser.parse()
    print(f"[Parsed AST]: {ast}")
    print(f"[LaTeX]: {ast.to_latex()}")

    # 2. Symbolic Differentiation
    d1 = ast.diff("x").simplify()
    print(f"[1st Derivative]: {d1}")
    d2 = d1.diff("x").simplify()
    print(f"[2nd Derivative]: {d2}")

    # 3. Numeric Evaluation
    val_x0 = ast.eval({"x": 1.0})
    val_d1 = d1.eval({"x": 1.0})
    print(f"[Evaluation at x=1.0]: f(1.0) = {val_x0:.4f}, f'(1.0) = {val_d1:.4f}")

    # 4. Taylor Series Approximation of cos(x) around x=0
    cos_expr = Cos(Var("x"))
    taylor_cos = CalculusTools.taylor_series(cos_expr, "x", center=0.0, degree=4)
    print(f"[Taylor Series cos(x) deg 4]: {taylor_cos}")
    approx_val = taylor_cos.eval({"x": 0.5})
    true_val = math.cos(0.5)
    print(f"  cos(0.5) approx: {approx_val:.6f} vs true: {true_val:.6f}")
    assert abs(approx_val - true_val) < 1e-4

    # 5. Newton-Raphson Root Finder with exact symbolic derivative
    # Solve x^3 - 2 = 0 => x = 2^(1/3) ~ 1.259921
    cube_expr = Sub(Pow(Var("x"), Const(3.0)), Const(2.0))
    root = CalculusTools.newton_raphson_solve(cube_expr, "x", x0=1.5)
    print(f"[Newton-Raphson Root of x^3 - 2 = 0]: x = {root:.8f}")
    assert abs(root ** 3 - 2.0) < 1e-9

    print("\nAll Symbolic AST & Differentiation engine tests passed successfully!")


if __name__ == "__main__":
    benchmark_symbolic_differentiation()
