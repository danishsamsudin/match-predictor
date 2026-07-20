# Chapter 6 – Build-Up Rating

## Part I – Foundations

### 6.1 Purpose

#### 6.1.1 Objective

The Build-Up Rating is the Primary Rating within the Graham League Prediction Model (GLPM) that estimates a team's underlying ability to progress possession from defensive and midfield areas into advanced attacking positions under opposition pressure.

Rather than measuring only progressive pass counts, the Build-Up Rating captures the repeatable processes that enable teams to advance the ball securely, resist presses, and distribute with controlled tempo.

#### 6.1.2 Scope

The Build-Up Rating evaluates three fundamental aspects of build-up play:

* Progressing the ball vertically through lines and into advanced zones.
* Retaining possession under high press stress with low turnover rates.
* Distributing accurately while managing possession tempo.

These abilities are estimated independently before being combined within GLPM's hierarchical rating framework.

#### 6.1.3 Outputs

The Build-Up Rating Model produces:

* Build-Up Rating
* Progression Rating
* Retention Rating
* Distribution Rating
* Six Component Ratings
* Rating Confidence
* Rating Variance
* Historical Trend
* Last Updated Timestamp

### 6.2 Philosophy

#### 6.2.1 Measuring Build-Up Ability

Build-up is the bridge between winning the ball and creating attacks. Successful build-up enables territorial advancement without exposing the team to dangerous turnovers.

Traditional statistics such as progressive passes often measure volume rather than quality under pressure. Accordingly, GLPM models build-up as a latent football ability representing a team's repeatable capacity to progress, retain, and distribute from deeper areas.

#### 6.2.2 Hierarchical Build-Up Architecture

```text
Build-Up Rating
│
├── Progression Rating
│   ├── Ball Progression Rating
│   └── Vertical Line-Breaking Rating
│
├── Retention Rating
│   ├── Press Resistance Rating
│   └── Security Rating
│
└── Distribution Rating
    ├── Distribution Accuracy Rating
    └── Tempo Rating
```

#### 6.2.3 Domain Summaries

* **Progression Rating** — advancing possession into dangerous zones via progressive actions and line-breaking passes.
* **Retention Rating** — maintaining the ball under press stress while limiting turnovers.
* **Distribution Rating** — accurate circulation with intentional tempo management.

### 6.3 Mathematical Definition

#### 6.3.1 Pipeline

```text
Historical Match Data
│
▼
Engineered Features
│
▼
Component Ratings
│
▼
Domain Ratings
│
▼
Build-Up Rating
```

#### 6.3.2 Domains and Components

| Symbol | Domain Rating |
| --- | --- |
| PG | Progression Rating |
| RT | Retention Rating |
| DS | Distribution Rating |

| Symbol | Component Rating |
| --- | --- |
| BP | Ball Progression Rating |
| VL | Vertical Line-Breaking Rating |
| PR | Press Resistance Rating |
| SEC | Security Rating |
| DA | Distribution Accuracy Rating |
| TP | Tempo Rating |

Hierarchical estimation:

* PG = f(BP, VL)
* RT = f(PR, SEC)
* DS = f(DA, TP)
* BU = f(PG, RT, DS)

### 6.4 Football Interpretation

Teams with high Build-Up Ratings consistently advance possession from deep areas, resist coordinated presses, and distribute with control. The rating complements Possession (sustained control after progression) and is the direct football counterpart of Pressing (disruption of build-up).

Within GLPM, Build-Up feeds the Expected Goals Engine alongside Attack, Defence, Goalkeeper, Possession, and Pressing.

## Part II – Data Pipeline

### 6.5 Data Sources and Raw Inputs

Historical build-up observations are drawn from Layer 1 match team statistics and Layer 2 engineered rates (SportMonks / Wyscout), including progressive passes and carries, final-third entries, through balls, pass completion, possession share, PPDA of the opponent, and ball recoveries / turnovers.

### 6.6 Data Preparation

Cleaning follows the shared GLPM conventions: null handling, per-90 and per-possession normalisation, winsorisation of extreme rates, and consistent polarity (higher = better).

### 6.7 Feature Engineering

#### 6.7.1 Ball Progression Features

* Progressive pass rate
* Progressive carry rate
* Final-third entry rate
* Box entry rate

#### 6.7.2 Vertical Line-Breaking Features

* Through-ball rate
* Progressive pass share of all passes
* Vertical progression index (final-third entries per progressive action)

#### 6.7.3 Press Resistance Features

* Pass completion under opposition pressing intensity
* Turnover suppression under high PPDA stress
* Successful pass share when opponent presses aggressively

#### 6.7.4 Security Features

* Incomplete-pass suppression (inverted incomplete rate)
* Possession security index
* Turnover rate inverse

#### 6.7.5 Distribution Accuracy Features

* Pass completion percentage
* Successful pass rate
* Distribution reliability index

#### 6.7.6 Tempo Features

* Passes per possession share
* Directness (progressive passes / passes)
* Possession rhythm proxy

Where event-sequence or tracking metrics are unavailable, L1/L2 proxies are used and documented in `features/midfield.py`.

### 6.8 Context and Opposition Adjustment

Build-up features are adjusted for home advantage, rest days, and fixture congestion, then scaled by opposition pressing strength:

* Preferred: Opposition Pressing Rating / 50
* Bootstrap: rolling opponent `1/PPDA` and high-turnover intensity

```text
x_adj = (x − ĉ(context)) / max(ε, s_opp)
```

## Part III – Component Ratings

Each Component Rating is estimated from its adjusted feature group using BayesianRidge (or LightGBM when training rows ≥ 500), supervised on forward-looking rolling means of a representative adjusted target to avoid leakage.

| Component | Representative target |
| --- | --- |
| Ball Progression | `prog_pass_rate_adj` |
| Vertical Line-Breaking | `through_ball_rate_adj` |
| Press Resistance | `press_resist_index_adj` |
| Security | `security_index_adj` |
| Distribution Accuracy | `pass_completion_pct_adj` |
| Tempo | `pass_tempo_adj` |

## Part IV – Rating Calibration

Component, Domain, and Primary latents are calibrated independently to the universal GLPM 0–100 framework via empirical CDF → piecewise percentile mapping (`GlpmCalibrator`).

## Part V – Domain Ratings

| Domain | Components |
| --- | --- |
| Progression | Ball Progression, Vertical Line-Breaking |
| Retention | Press Resistance, Security |
| Distribution | Distribution Accuracy, Tempo |

## Part VI – Primary Rating

The Build-Up Rating is estimated as:

* BU = f(Progression, Retention, Distribution)

Supervised on future adjusted progression outcomes (`final_third_entry_rate_adj`, `prog_pass_rate_adj`).

### Midfield Component Inventory (Chapters 6–8)

```text
Build-Up Rating
├── Progression        ← ball_progression, vertical_line_breaking
├── Retention          ← press_resistance, security
└── Distribution       ← distribution_accuracy, tempo

Possession Rating
├── Ball Retention     ← possession_security, ball_circulation
├── Territorial Control← territorial_dominance, space_control
└── Possession Control ← game_control, possession_tempo

Pressing Rating
├── Press Intensity    ← high_press, mid_block_press
├── Ball Recovery      ← counter_press, recovery_efficiency
└── Press Effectiveness← press_success, press_resistance_disruption
```

These three engines are statistically independent during estimation and interact only at synthesis time (Expected Goals Engine / match simulation).
