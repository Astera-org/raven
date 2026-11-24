# Math import test

Paid \$5, then fit $y = 2x$

## Dollar signs that are not math

M1. The kit cost $5 and the reagent cost $10 per sample.

M2. The kit cost \$5 and the reagent cost \$10 per sample.

M3. One price on its own: about $5 per run.

M4. Math, then a price: we set $x = 2$ and paid $5 for it.

M5. Spaces inside the dollars: $ x = 2 $ here.

M6. A digit right after the closing dollar: $x$5 apples.

## Greek letters and italics

G1. Body-font italic Greek: _α_ = 0.05 and _ρ_ = 0.8.

G2. LaTeX Greek: $\alpha = 0.05$ and $\rho = 0.8$.

G3. Upright Greek in prose: a Δ of 3 and β-actin.

G4. Effect size with a Unicode superscript: _η_² = 0.12.

## Subscripts and superscripts

S1. LaTeX label subscript: $K_\mathrm{d} = 4$ nM.

S2. Docs subscript formatting: _K_<sub>d</sub> = 4 nM.

S3. Unicode superscripts: R² = 0.91 and 10⁻³.

S4. Docs superscript formatting: R<sup>2</sup> = 0.91.

S5. LaTeX superscripts: $R^2 = 0.91$ and $10^{-3}$.

## LaTeX commands

L1. $\boldsymbol{x}$, $\mathcal{L}$, $\mathsf{W}$, $\hat{\beta}$ and $\mathbb{E}$.

L2. $\log p_i$ and $\exp(x)$.

L3. $\text{max}$ and $v_{\text{max}}$.

L4. $\frac{a}{b}$ and $\sqrt{x}$.

## Block math

B1. The block below should render as one centered equation.

$$

y = \beta_0 + \beta_1 x

$$

## Math in other places

### H1. Heading with $\alpha$ in it

* K1. List item with $x = 2$ in it.

C1. Code stays code: `$HOME` and `cost = $5`.

C2. The figure ([Figure 1](#math-test-fig)) and table ([Table 1](#math-test-table)) captions below hold math.

::::::figure{#math-test-fig align="center" type="image" label="Figure 1"}

:::::image{width="50%" alt="Test image" src="raven-media://media-1"}
:::::

:::::figcaption
**Figure 1.** Fit of $K_\mathrm{d}$ by _α_. The curve shows $y = \beta_0 + \beta_1 x$ with _R_² = 0.91.
:::::

::::::

::::::figure{#math-test-table type="table" label="Table 1"}
| **Symbol**      | **Value** |
| --------------- | --------- |
| $\alpha$        | 0.05      |
| _K_<sub>d</sub> | 4 nM      |
| $R^2$           | 0.91      |

:::::figcaption
**Table 1.** **Table with $\alpha$ in the title.** Body with $n = 12$ and _p_ < 0.001.
:::::

::::::

