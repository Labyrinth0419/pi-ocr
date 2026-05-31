# pi-ocr Backend Benchmark

**Test Image**: `test.png` (Chinese academic text with LaTeX math formulas)  
**pi-ocr version**: 1.3.3  
**Date**: 2026-05-31

---

## Ground Truth

```
#### 3.2.1 样本方差与卡方分布的关系

> **定理 4（样本方差的分布）**  
> 设 $Y_1, Y_2, \ldots, Y_n$ 是来自 $N(\mu, \sigma^2)$ 的随机样本。则：
>
> (a) $S^2$ 与 $\bar{Y}$ **相互独立**。
>
> (b) $\frac{(n-1)S^2}{\sigma^2} = \frac{1}{\sigma^2} \sum_{i=1}^{n} (Y_i - \bar{Y})^2$ 服从自由度为 $n-1$ 的**卡方分布**。

**证明思路**：令 $X_i = (Y_i - \mu)/\sigma$，则所有 $X_i \sim N(0,1)$。构造一个 $n \times n$ 的正交矩阵 $A$，其最后一行均为 $1/\sqrt{n}$。定义 $Z = AX$，可以证明 $Z_n = \sqrt{n}\bar{X}$，且 $\sum_{j=1}^{n-1} Z_j^2 = \sum_{i=1}^{n} (X_i - \bar{X})^2$，从而 $\sum_{i=1}^{n} (Y_i - \bar{Y})^2 = \sigma^2 \sum_{i=1}^{n} (X_i - \bar{X})^2$ 服从 $\sigma^2 \chi^2(n-1)$。
```

---

## ① 🦙 Ollama (glm-ocr) — Score: 9.5/10

```
# 3.2.1 样本方差与卡方分布的关系

定理 4（样本方差的分布）
设 $Y_1, Y_2, \ldots, Y_n$ 是来自 $N(\mu, \sigma^2)$ 的随机样本。则：

(a) $S^2$ 与 $\bar{Y}$ 相互独立。

(b) $\frac{(n-1)S^2}{\sigma^2} = \frac{1}{\sigma^2} \sum_{i=1}^{n}(Y_i - \bar{Y})^2$ 服从自由度为 $n-1$ 的卡方分布。

证明思路：令 $X_i = (Y_i - \mu)/\sigma$，则所有 $X_i \sim N(0, 1)$。构造一个 $n \times n$ 的正交矩阵 $A$，其最后一行均为 $1/\sqrt{n}$。定义 $Z = AX$，可以证明 $Z_n = \sqrt{n}\bar{X}$，且 $\sum_{j=1}^{n-1} Z_j^2 = \sum_{i=1}^{n}(X_i - \bar{X})^2$，从而 $\sum_{i=1}^{n}(Y_i - \bar{Y})^2 = \sigma^2 \sum_{i=1}^{n}(X_i - \bar{X})^2$ 服从 $\sigma^2\chi^2(n-1)$。
```

> ✅ Near-perfect. Minor: "定理 4" not wrapped in LaTeX, slight extra whitespace.

---

## ② ☁️ MinerU (free Agent API) — Score: 8/10

```
## 3.2.1样本方差与卡方分布的关系

定理4 (样本方差的分布)

设 $Y _ { 1 } , Y _ { 2 } , \dots , Y _ { n }$ 是来自 $N ( \mu , \sigma ^ { 2 } )$ 的随机样本。则：

(a) $S ^ { 2 } \subseteq { \bar { Y } }$ 相互独立。

（b) $\begin{array} { r } { \frac { ( n - 1 ) S ^ { 2 } } { \sigma ^ { 2 } } = \frac { 1 } { \sigma ^ { 2 } } \sum _ { i = 1 } ^ { n } ( Y _ { i } - \bar { Y } ) ^ { 2 } } \end{array}$ 服从自由度为𝑛－1的卡方分布。

证明思路：令 $X _ { i } = ( Y _ { i } - \mu ) / \sigma$ ，则所有 $X _ { i } \sim N ( 0 , 1 )$ 。构造一个𝑛×𝑛的正交矩阵A，其最后一行均为 $1 / { \sqrt { n } }$ 。定义 $Z = A X$ ，可以证明 $Z _ { n } = { \sqrt { n } } { \bar { X } }$ ，且 $\begin{array} { r } { \sum _ { j = 1 } ^ { n - 1 } Z _ { j } ^ { 2 } = \sum _ { i = 1 } ^ { n } ( X _ { i } - \bar { X } ) ^ { 2 } } \end{array}$ ，从而 $\textstyle \sum _ { i = 1 } ^ { n } ( Y _ { i } - { \bar { Y } } ) ^ { 2 } = \sigma ^ { 2 } \sum _ { i = 1 } ^ { n } ( X _ { i } - { \bar { X } } ) ^ { 2 }$ 服从 $\sigma ^ { 2 } \chi ^ { 2 } ( n - 1 )$
```

> ✅ Chinese correct, formulas recognized. ⚠️ "与"→`\subseteq`, formulas wrapped in `\begin{array}`, extra LaTeX whitespace.

---

## ③ ☁️ MinerU Pro (vlm, token required) — Score: 9/10

```
# 3.2.1 样本方差与卡方分布的关系

定理4（样本方差的分布）

设 $Y_{1}, Y_{2}, \ldots, Y_{n}$ 是来自 $N(\mu, \sigma^{2})$ 的随机样本。则：

(a) $S^2$ 与 $\bar{Y}$ 相互独立。  
(b) $\frac{(n - 1)S^2}{\sigma^2} = \frac{1}{\sigma^2}\sum_{i = 1}^{n}(Y_i - \bar{Y})^2$ 服从自由度为 $n - 1$ 的卡方分布。

证明思路：令 $X_{i} = (Y_{i} - \mu) / \sigma$ ，则所有 $X_{i}\sim N(0,1)$ 。构造一个 $n\times n$ 的正交矩阵 $A$ ，其最后一行均为 $1 / \sqrt{n}$ 。定义 $Z = AX$ ，可以证明 $Z_{n} = \sqrt{n}\bar{X}$ ，且 $\sum_{j = 1}^{n - 1}Z_j^2 = \sum_{i = 1}^n (X_i - \bar{X})^2$ ，从而 $\sum_{i = 1}^{n}(Y_{i} - \bar{Y})^{2} = \sigma^{2}\sum_{i = 1}^{n}(X_{i} - \bar{X})^{2}$ 服从 $\sigma^2\chi^2 (n - 1)$ 。
```

> ✅ vlm model is significantly cleaner. No `\begin{array}` wrapping, no `\subseteq` error. Closest to Ollama quality. Requires free token, ≤200MB/≤200 pages.

---

## ④ 🔤 Tesseract (eng+chi_sim) — Score: 4/10

```
3.21 样本 方差 与 卡 方 分 布 的 关系

定理 4 (样本 方差 的 分 布 )
设 Y1,Yo,..., Yn BRE N(p, 07) 的 随机 样本 。 则 :

(a) 32 与 Y 相互 独立 。

(bo) CYS = en |( 玉 一 部)2 服从 自由 度 为 风 一 1 WEA

o o-

证 明 思 路 : 令 X;=(¥;—p)/o, TWA X; ~ N(0,1). MiB—hn x n WER 4， 其 最 后 一 行 均 为 1/Vm。 定
MZ=AX, WEA Z, = VnX, BT Z? 一 (Xi — X)?, Mil OLY; — Y)? = 0? WE (2 — X)?
服从 0? x? (n — 1).
```

> ✅ Chinese text characters recognized. ❌ Math formulas entirely broken — Greek letters, subscripts, fractions all wrong.

---

## ⑤ 📐 Pix2Text (mps, GPU-accelerated) — Score: 7.5/10

```
3.2.1样本方差与卡方分布的关系
定理 $4$ (样本方差的分布）
设 $Y_{1} , Y_{2} , \ldots, Y_{n}$ 是来自 $N ( \mu, \sigma^{2} )$ 的随机样本。则：
(O) $S^{2} \varXi\bar{Y}$ 相互独立。
(b $\frac{( n-1 ) S^{2}} {\sigma^{2}}=\frac{1} {\sigma^{2}} \sum_{i=1}^{n} ( Y_{i}-\bar{Y} )^{2}$ 服从自由度为 $n-1$ 的卡方分布
证明思路：令 $X_{i}=( Y_{i}-\mu) / \sigma$ ，则所有 $X_{i} \sim N ( 0 , 1 )$ 。构造一个 $n \times n$ 的正交矩阵 $\boldsymbol{A}$ ，其最后一行均为 $1 / \sqrt{n}$ 。定义 $Z=A X$ ，可以证明 $Z_{n}=\sqrt{n} \bar{X}$ ，日 $\sum_{j=1}^{n-1} Z_{j}^{2}=\sum_{i=1}^{n} ( X_{i}-\bar{X} )^{2}$ ，从而 $\sum_{i=1}^{n} ( Y_{i}-\bar{Y} )^{2}=\sigma^{2} \sum_{i=1}^{n} ( X_{i}-\bar{X} )^{2}$ 服从 $\sigma^{2} \chi^{2} ( n-1 ) .$
```

> ✅ Both Chinese text and math formulas are usable. ⚠️ (a)→(O), "与"→Ξ, "且"→"日" — minor symbol errors.

---

## Ranking

| Rank | Backend | Chinese | LaTeX | Score | Best For |
|---|---|---|---|---|---|
| 1 | 🦙 Ollama | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | 9.5 | Math formulas, unlimited pages |
| 2 | ☁️ MinerU Pro | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ | 9.0 | Large files (≤200MB), no GPU needed |
| 3 | ☁️ MinerU Free | ⭐⭐⭐⭐ | ⭐⭐⭐ | 8.0 | Zero setup, daily documents |
| 4 | 📐 Pix2Text | ⭐⭐⭐⭐ | ⭐⭐⭐⭐ | 7.5 | Offline CPU/GPU, math formulas |
| 5 | 🔤 Tesseract | ⭐⭐⭐ | ❌ | 4.0 | Plain text only, ultra-lightweight |
