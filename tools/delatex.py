# SPDX-License-Identifier: AGPL-3.0-or-later
# Убрать формулы LaTeX ($\text{PaO}_2$ и т. п.) из статей об анализах: ИИ иногда пишет их, а сайт их не рендерит.
# Запуск: python tools/delatex.py  (меняет только файлы, где были формулы; печатает их список)
import glob, os, re
ART = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "docs", "articles", "lab-tests")
SUB = str.maketrans("0123456789+-", "₀₁₂₃₄₅₆₇₈₉₊₋")
SUP = str.maketrans("0123456789+-", "⁰¹²³⁴⁵⁶⁷⁸⁹⁺⁻")
SYM = {r"\cdot": "·", r"\times": "×", r"\geq": "≥", r"\ge": "≥", r"\leq": "≤", r"\le": "≤", r"\approx": "≈", r"\pm": "±",
       r"\alpha": "α", r"\beta": "β", r"\gamma": "γ", r"\delta": "δ", r"\kappa": "κ", r"\lambda": "λ", r"\mu": "мк", r"\%": "%",
       r"\to": "→", r"\rightarrow": "→", r"\,": " ", r"\;": " ", r"\ ": " "}
def conv(m):
    s = m.group(1)
    s = re.sub(r"\\(?:text|mathrm|textrm|mathit|mathbf)\{([^{}]*)\}", r"\1", s)
    s = re.sub(r"\\frac\{([^{}]*)\}\{([^{}]*)\}", r"\1/\2", s)
    for k in sorted(SYM, key=len, reverse=True): s = s.replace(k, SYM[k])
    s = re.sub(r"_\{([0-9+\-]+)\}|_([0-9+\-])", lambda x: (x.group(1) or x.group(2)).translate(SUB), s)
    s = re.sub(r"\^\{([0-9+\-]+)\}|\^([0-9+\-])", lambda x: (x.group(1) or x.group(2)).translate(SUP), s)
    return s.replace("{", "").replace("}", "")
for f in sorted(glob.glob(os.path.join(ART, "*.md"))):
    t = open(f, encoding="utf-8").read()
    n = re.sub(r"\$\$?([^$\n]{1,400}?)\$\$?", conv, t)
    if n != t:
        open(f, "w", encoding="utf-8", newline="\n").write(n); print(os.path.basename(f))
