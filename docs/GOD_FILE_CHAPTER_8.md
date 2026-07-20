# Chapter 8 – Pressing Rating

## Part I – Foundations

### 8.1 Purpose

#### 8.1.1 Objective

The Pressing Rating is the Primary Rating within the Graham League Prediction Model (GLPM) that estimates a team's underlying ability to regain possession, disrupt opposition build-up play and apply coordinated defensive pressure.

Rather than measuring pressing solely through counts of pressures or tackles, the Pressing Rating captures the repeatable tactical processes that enable teams to force turnovers, constrain opponent decision-making and create advantageous transition opportunities.

#### 8.1.2 Scope

The Pressing Rating evaluates three fundamental dimensions of pressing performance:

* Applying coordinated pressure across different defensive phases.
* Recovering possession efficiently following defensive actions.
* Disrupting opposition possession and build-up play.

These dimensions are estimated independently before being combined within GLPM's hierarchical rating framework.

#### 8.1.3 Outputs

The Pressing Rating Model produces:

* Pressing Rating
* Press Intensity Rating
* Ball Recovery Rating
* Press Effectiveness Rating
* Six Component Ratings
* Rating Confidence
* Rating Variance
* Historical Trend
* Last Updated Timestamp

### 8.2 Philosophy

#### 8.2.1 Measuring Pressing Ability

Modern pressing extends beyond simply closing down opponents. Effective pressing requires coordination, intelligent positioning, timing and collective organisation to limit passing options, force mistakes and regain possession.

Traditional statistics such as tackles or pressures often measure activity rather than effectiveness. A team may record many pressures without consistently disrupting opponents or recovering the ball.

Accordingly, GLPM models pressing as a latent football ability representing a team's repeatable capacity to apply effective defensive pressure and regain possession.

#### 8.2.2 Hierarchical Pressing Architecture

The Pressing Rating is estimated using a hierarchical structure comprising Component Ratings, Domain Ratings and a Primary Rating.

```text
Pressing Rating
│
├── Press Intensity Rating
│   ├── High Press Rating
│   └── Mid-Block Press Rating
│
├── Ball Recovery Rating
│   ├── Counter-Press Rating
│   └── Recovery Efficiency Rating
│
└── Press Effectiveness Rating
    ├── Press Success Rating
    └── Press Resistance Disruption Rating

```

This hierarchy separates the frequency of pressing, the ability to recover possession and the effectiveness of disrupting opponents into distinct latent abilities.

#### 8.2.3 Press Intensity Rating

The Press Intensity Rating measures how aggressively and consistently a team applies defensive pressure across different areas of the pitch.

It is estimated from:

* High Press Rating
* Mid-Block Press Rating

Together these Component Ratings capture a team's preferred intensity and structure when pressing.

#### 8.2.4 Ball Recovery Rating

The Ball Recovery Rating measures how efficiently a team regains possession after initiating defensive pressure.

It is estimated from:

* Counter-Press Rating
* Recovery Efficiency Rating

These Component Ratings evaluate the ability to convert defensive pressure into regained possession.

#### 8.2.5 Press Effectiveness Rating

The Press Effectiveness Rating measures how successfully a team's pressing disrupts opposition possession and build-up play.

It is estimated from:

* Press Success Rating
* Press Resistance Disruption Rating

Together these Component Ratings quantify the outcomes of coordinated pressing actions.

#### 8.2.6 Why a Hierarchical Model?

Representing pressing through a hierarchy of latent ratings provides several advantages:

* Separates pressing intensity from pressing effectiveness.
* Distinguishes ball recovery from defensive organisation.
* Improves model interpretability.
* Reduces redundancy between correlated variables.
* Produces more stable estimates across seasons.
* Improves downstream prediction within the Expected Goals Engine.

Rather than treating pressing as a single observable statistic, GLPM estimates the underlying abilities that collectively determine a team's effectiveness without the ball.

### 8.3 Mathematical Definition

#### 8.3.1 Purpose

The Pressing Rating is estimated using a hierarchical latent-variable model.

Historical match observations are transformed into engineered features before estimating Component Ratings, which are aggregated into Domain Ratings and ultimately combined into the overall Pressing Rating.

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
Pressing Rating

```

#### 8.3.2 Domain Ratings

The Pressing Rating is composed of three Domain Ratings.

| Symbol | Domain Rating |
| --- | --- |
| PI | Press Intensity Rating |
| BR | Ball Recovery Rating |
| PE | Press Effectiveness Rating |

#### 8.3.3 Component Ratings

Each Domain Rating is estimated from specialised Component Ratings.

| Symbol | Component Rating |
| --- | --- |
| HP | High Press Rating |
| MB | Mid-Block Press Rating |
| CP | Counter-Press Rating |
| RE | Recovery Efficiency Rating |
| PS | Press Success Rating |
| PD | Press Resistance Disruption Rating |

#### 8.3.4 Hierarchical Estimation

The relationships are defined conceptually as:

* PI = f(HP, MB)
* BR = f(CP, RE)
* PE = f(PS, PD)

The overall Pressing Rating is then estimated as:

* PR = f(PI, BR, PE)

where:

* PR = Pressing Rating
* PI = Press Intensity Rating
* BR = Ball Recovery Rating
* PE = Press Effectiveness Rating

The functions are learned from historical data using statistical and machine learning methods.

#### 8.3.5 Relationship to the Expected Goals Engine

The Pressing Rating provides one of the Primary Ratings used within the Expected Goals Engine.

Conceptually,

* xG = g(A, D, GK, BU, PO, PR, M)

where:

* A = Attack Rating
* D = Defence Rating
* GK = Goalkeeper Rating
* BU = Build-Up Rating
* PO = Possession Rating
* PR = Pressing Rating
* M = Match Context Variables

The Pressing Rating influences expected goals by affecting defensive transitions, possession recoveries, field position and the quality of attacking opportunities created immediately after regaining possession.

### 8.4 Football Interpretation

#### 8.4.1 Interpreting the Pressing Rating

Teams with high Pressing Ratings consistently disrupt opposition possession, regain the ball efficiently and force opponents into low-quality decisions through coordinated defensive pressure.

High ratings reflect organised collective behaviour rather than simply frequent pressing actions.

#### 8.4.2 Relationship Between the Domain Ratings

The three Domain Ratings capture complementary aspects of pressing performance.

* Press Intensity Rating measures how consistently and aggressively a team applies pressure.
* Ball Recovery Rating measures how effectively pressure leads to regained possession.
* Press Effectiveness Rating measures how successfully pressing disrupts opposition build-up and decision-making.

Together these ratings provide a comprehensive representation of a team's pressing ability.

#### 8.4.3 Role Within GLPM

The Pressing Rating represents a team's ability to regain possession and influence matches without the ball.

It complements the Defence Rating by focusing on proactive disruption rather than chance prevention, and complements the Possession Rating by creating opportunities to quickly regain control after losing possession.

Within GLPM, the Pressing Rating serves as one of the Primary Ratings contributing directly to the Expected Goals Engine and downstream prediction models.

### 8.5 Data Sources and Raw Inputs

#### 8.5.1 Purpose

The Pressing Rating is estimated using historical match observations describing how teams apply defensive pressure, recover possession and disrupt opposition build-up play.

Rather than relying solely on counts of pressures or tackles, GLPM combines event-level and sequence-level observations that capture the underlying processes responsible for effective pressing.

These observations provide the foundation for feature engineering and the estimation of the six Pressing Component Ratings.

#### 8.5.2 Data Sources

Historical pressing data are collected from structured football datasets, including event-based and tracking data where available.

Typical data sources include:

* Event Data
* Match Statistics
* Player Tracking Data
* Defensive Action Logs
* Possession Sequence Data
* Ball Recovery Events

Each observation is linked to the relevant team, opponent, competition, season and match context.

#### 8.5.3 Pressing Data Categories

Raw observations are organised into several categories representing different aspects of pressing performance.

| Category | Example Variables |
| --- | --- |
| High Press | High Press Attempts, High Recoveries, Final Third Pressures |
| Mid-Block Press | Mid-Block Pressures, Defensive Shape, Pressure Events |
| Counter-Press | Counter-Press Attempts, Immediate Recoveries, Transition Pressures |
| Ball Recovery | Recoveries, Loose Ball Wins, Interceptions Following Pressure |
| Press Success | Forced Errors, Press Success Rate, Press-Induced Turnovers |
| Press Disruption | Long Balls Forced, Build-Up Disruptions, Backward Passes Forced |

These observations collectively describe a team's ability to regain possession and interfere with opposition possession.

#### 8.5.4 Defensive Transition Data

Because pressing is closely linked to defensive transitions, GLPM incorporates observations describing how teams react immediately after losing possession.

Representative variables include:

* Time to First Pressure
* Time to Ball Recovery
* Transition Recovery Distance
* Immediate Counter-Press Attempts
* Opponent Progression After Turnover
* Defensive Transition Duration

These observations quantify how effectively teams respond during the critical moments following a change of possession.

#### 8.5.5 Data Granularity

Pressing observations may be recorded at multiple levels.

These include:

* Match Level
* Team Level
* Possession Level
* Defensive Sequence Level
* Event Level

Defensive sequence-level and event-level observations provide the highest precision for estimating pressing performance.

### 8.6 Data Preparation and Cleaning

#### 8.6.1 Purpose

Raw pressing observations frequently contain inconsistencies arising from different event definitions, tracking systems and data providers.

The preparation stage standardises these observations before feature engineering and statistical estimation.

#### 8.6.2 Data Cleaning

The cleaning process includes:

* Removal of duplicate defensive events.
* Validation of pressing sequences.
* Standardisation of player and team identifiers.
* Correction of event timestamps.
* Verification of defensive event ordering.
* Removal of invalid observations.

Only validated observations are retained for modelling.

#### 8.6.3 Missing Data

Missing observations are handled using statistically appropriate imputation techniques.

Possible approaches include:

* Bayesian Imputation
* Historical Team Priors
* League-Level Priors
* Model-Based Imputation

The selected approach depends on data availability and observation reliability.

#### 8.6.4 Normalisation

To improve comparability across competitions and tactical systems, variables are normalised where appropriate.

Typical transformations include:

* Per 90 Minutes
* Per Opposition Possession
* Per Defensive Sequence
* Per Pressing Opportunity
* Per Transition

These transformations reduce systematic bias arising from different possession shares and playing styles.

#### 8.6.5 Outlier Detection

Extreme observations are evaluated using robust statistical procedures.

Potential outliers include:

* Matches with unusually low opposition possession.
* Very high pressing volumes.
* Unbalanced scorelines.
* Severe weather conditions.
* Data collection anomalies.

Where appropriate, observations may be winsorised or assigned reduced statistical weight.

### 8.7 Feature Engineering

#### 8.7.1 Purpose

Feature engineering transforms raw pressing observations into statistically informative variables representing the underlying abilities associated with effective pressing.

These engineered features provide the inputs for estimating the six Component Ratings.

#### 8.7.2 High Press Features

Representative features include:

* High Press Success Rate
* Final Third Pressure Frequency
* High Recovery Rate
* Opposition Build-Up Disruption Index
* Pressing Height
* High Press Efficiency

These variables estimate a team's ability to apply coordinated pressure high up the pitch.

#### 8.7.3 Mid-Block Press Features

Representative features include:

* Mid-Block Pressure Frequency
* Compactness During Press
* Mid-Block Recovery Rate
* Pressure Timing Index
* Defensive Shape Stability
* Mid-Block Success Rate

These variables measure organised pressure applied from intermediate defensive positions.

#### 8.7.4 Counter-Press Features

Representative features include:

* Counter-Press Success Rate
* Immediate Recovery Percentage
* Transition Pressure Frequency
* Recovery Within Five Seconds
* Transition Compactness
* Counter-Press Efficiency

These variables estimate how effectively teams respond immediately after losing possession.

#### 8.7.5 Recovery Efficiency Features

Representative features include:

* Ball Recoveries per Opposition Possession
* Recovery Distance
* Recovery Time
* Loose Ball Recovery Rate
* Defensive Sequence Efficiency
* Recovery Conversion Index

These variables measure how effectively pressing actions result in regained possession.

#### 8.7.6 Press Success Features

Representative features include:

* Forced Turnover Rate
* Press Success Percentage
* Passes Prevented
* Press-Induced Errors
* Opposition Pass Completion Reduction
* Successful Pressure Index

These variables estimate the direct effectiveness of pressing actions.

#### 8.7.7 Press Resistance Disruption Features

Representative features include:

* Long Balls Forced
* Backward Pass Percentage
* Build-Up Disruption Index
* Opposition Progression Reduction
* Press Escape Failure Rate
* Possession Sequence Termination Rate

These variables estimate how effectively pressing prevents opponents from executing their intended build-up.

#### 8.7.8 Feature Scaling

Following feature engineering, variables are transformed using statistically appropriate scaling procedures.

Typical methods include:

* Standardisation
* Robust Scaling
* Logarithmic Transformation
* Quantile Normalisation

The chosen transformation depends on the statistical distribution of each feature.

### 8.8 Context and Opposition Adjustment

#### 8.8.1 Purpose

Observed pressing statistics are influenced by opponent quality, tactical philosophy and match context.

To estimate underlying pressing ability rather than observed outcomes, GLPM adjusts engineered features for contextual influences before estimating the Component Ratings.

#### 8.8.2 Opposition Adjustment

Pressing observations are adjusted according to the characteristics of the opposition.

Representative adjustments include:

* Opposition Build-Up Rating
* Opposition Possession Rating
* Opposition Press Resistance
* Opposition Tactical Style

These adjustments ensure that successfully pressing technically strong opponents is appropriately rewarded.

#### 8.8.3 Tactical Adjustment

Additional adjustments account for differences in pressing philosophy.

Representative variables include:

* Formation
* Defensive Line Height
* Pressing Trigger Frequency
* Team Compactness
* Block Height
* Tactical Flexibility

These adjustments reduce stylistic bias between teams employing different defensive approaches.

#### 8.8.4 Match Context

Additional contextual adjustments include:

* Home Advantage
* Match State
* Rest Days
* Fixture Congestion
* Competition Type
* Playing Surface
* Weather Conditions

These factors account for external influences on pressing performance.

#### 8.8.5 Adjusted Pressing Features

Following contextual adjustment, the resulting engineered features provide unbiased estimates of a team's underlying pressing abilities.

These adjusted features form the inputs to the six Component Rating models described in Part III.

**Chapter Pipeline Summary**

```text
Historical Match Data
│
▼
Raw Pressing Observations
│
▼
Data Cleaning & Preparation
│
▼
Feature Engineering
│
▼
Context & Opposition Adjustment
│ 
▼
Adjusted Pressing Features
│
▼
Component Rating Models
│
▼
Press Intensity Rating
Ball Recovery Rating
Press Effectiveness Rating
│
▼
Pressing Rating

```

### 8.9 High Press Rating

#### 8.9.1 Purpose

The High Press Rating measures a team's underlying ability to apply coordinated defensive pressure high up the pitch, limiting opposition build-up and forcing possession losses in advanced areas.

The High Press Rating forms one of the two Component Ratings used to estimate the Press Intensity Rating.

#### 8.9.2 Football Interpretation

Teams with high High Press Ratings consistently:

* Apply coordinated pressure in the attacking third.
* Limit opposition passing options.
* Force rushed decisions.
* Restrict controlled build-up.
* Maintain collective defensive organisation while pressing high.

The rating reflects the effectiveness of sustained high pressing.

#### 8.9.3 Raw Inputs

Representative variables include:

* High Press Attempts
* Final Third Pressures
* High Recoveries
* Pressure Events
* Opposition Build-Up Sequences
* Forced Long Balls

#### 8.9.4 Engineered Features

Representative features include:

* High Press Success Rate
* Final Third Pressure Frequency
* High Recovery Rate
* Pressing Height Index
* High Press Efficiency
* Opposition Build-Up Disruption Index

#### 8.9.5 Statistical Estimation

Features are adjusted for:

* Opposition Build-Up Rating
* Match Context
* Tactical Style
* Competition Strength
* Home Advantage

The adjusted observations estimate the latent High Press Rating.

#### 8.9.6 Machine Learning Model

Candidate algorithms include:

* Gradient Boosted Trees
* Bayesian Hierarchical Models
* Random Forests
* Elastic Net Regression

The final model is selected according to predictive accuracy, calibration and long-term stability.

#### 8.9.7 Outputs

The model stores:

* High Press Rating
* Confidence Score
* Rating Variance
* Historical Trend
* Last Updated

#### 8.9.8 Relationship to Press Intensity Rating

The High Press Rating combines with the Mid-Block Press Rating to estimate the Press Intensity Rating.

### 8.10 Mid-Block Press Rating

#### 8.10.1 Purpose

The Mid-Block Press Rating measures a team's ability to apply organised defensive pressure from intermediate defensive positions while maintaining tactical compactness.

The Mid-Block Press Rating forms one of the two Component Ratings contributing to the Press Intensity Rating.

#### 8.10.2 Football Interpretation

Teams with high Mid-Block Press Ratings consistently:

* Maintain compact defensive structure.
* Apply coordinated pressure in midfield.
* Limit opposition progression.
* Force low-value passes.
* Preserve defensive organisation.

The rating reflects the effectiveness of organised pressing outside the attacking third.

#### 8.10.3 Raw Inputs

Representative variables include:

* Mid-Block Pressures
* Defensive Pressure Events
* Midfield Recoveries
* Opposition Progressions
* Defensive Shape
* Pressure Duration

#### 8.10.4 Engineered Features

Representative features include:

* Mid-Block Success Rate
* Pressure Timing Index
* Compactness Index
* Midfield Recovery Rate
* Defensive Shape Stability
* Mid-Block Efficiency

#### 8.10.5 Statistical Estimation

Features are adjusted for:

* Opposition Build-Up Rating
* Tactical Style
* Match Context
* Competition Strength

The adjusted observations estimate the latent Mid-Block Press Rating.

#### 8.10.6 Machine Learning Model

Candidate algorithms include:

* Gradient Boosted Trees
* Bayesian Hierarchical Models
* Random Forests

#### 8.10.7 Outputs

The model stores:

* Mid-Block Press Rating
* Confidence Score
* Rating Variance
* Historical Trend
* Last Updated

#### 8.10.8 Relationship to Press Intensity Rating

The Mid-Block Press Rating complements the High Press Rating in estimating the Press Intensity Rating.

### 8.11 Counter-Press Rating

#### 8.11.1 Purpose

The Counter-Press Rating measures a team's ability to immediately apply defensive pressure after losing possession in an attempt to quickly regain the ball.

The Counter-Press Rating forms one of the two Component Ratings contributing to the Ball Recovery Rating.

#### 8.11.2 Football Interpretation

Teams with high Counter-Press Ratings consistently:

* React quickly after losing possession.
* Apply immediate pressure.
* Reduce opposition transition opportunities.
* Force rapid turnovers.
* Regain possession in advanced areas.

The rating reflects the effectiveness of immediate defensive reactions.

#### 8.11.3 Raw Inputs

Representative variables include:

* Counter-Press Attempts
* Immediate Pressures
* Transition Recoveries
* Recovery Time
* Pressure After Turnover
* Immediate Ball Recoveries

#### 8.11.4 Engineered Features

Representative features include:

* Counter-Press Success Rate
* Recovery Within Five Seconds
* Transition Pressure Frequency
* Immediate Recovery Percentage
* Counter-Press Efficiency
* Transition Compactness

#### 8.11.5 Statistical Estimation

Features are adjusted for:

* Opposition Build-Up Rating
* Tactical Style
* Match Context
* Competition Strength

The adjusted observations estimate the latent Counter-Press Rating.

#### 8.11.6 Machine Learning Model

Candidate algorithms include:

* Gradient Boosted Trees
* Bayesian Hierarchical Models
* Random Forests

#### 8.11.7 Outputs

The model stores:

* Counter-Press Rating
* Confidence Score
* Rating Variance
* Historical Trend
* Last Updated

#### 8.11.8 Relationship to Ball Recovery Rating

The Counter-Press Rating combines with the Recovery Efficiency Rating to estimate the Ball Recovery Rating.

### 8.12 Recovery Efficiency Rating

#### 8.12.1 Purpose

The Recovery Efficiency Rating measures how effectively a team converts defensive pressure into successful ball recoveries.

The Recovery Efficiency Rating forms one of the two Component Ratings contributing to the Ball Recovery Rating.

#### 8.12.2 Football Interpretation

Teams with high Recovery Efficiency Ratings consistently:

* Win loose balls.
* Recover possession quickly.
* Convert pressure into recoveries.
* Prevent sustained opposition possession.
* Maintain defensive stability following recoveries.

The rating reflects the efficiency of regaining possession.

#### 8.12.3 Raw Inputs

Representative variables include:

* Ball Recoveries
* Loose Ball Wins
* Interceptions
* Recovery Distance
* Recovery Time
* Recovery Locations

#### 8.12.4 Engineered Features

Representative features include:

* Recovery Conversion Rate
* Recoveries per Opposition Possession
* Loose Ball Recovery Rate
* Recovery Efficiency Index
* Recovery Time Index
* Defensive Sequence Efficiency

#### 8.12.5 Statistical Estimation

Features are adjusted for:

* Opposition Quality
* Tactical Style
* Match Context
* Competition Strength

The adjusted observations estimate the latent Recovery Efficiency Rating.

#### 8.12.6 Machine Learning Model

Candidate algorithms include:

* Gradient Boosted Trees
* Bayesian Hierarchical Models
* Random Forests

#### 8.12.7 Outputs

The model stores:

* Recovery Efficiency Rating
* Confidence Score
* Rating Variance
* Historical Trend
* Last Updated

#### 8.12.8 Relationship to Ball Recovery Rating

The Recovery Efficiency Rating complements the Counter-Press Rating in estimating the Ball Recovery Rating.

### 8.13 Press Success Rating

#### 8.13.1 Purpose

The Press Success Rating measures how consistently a team's pressing actions achieve their intended outcomes by forcing errors, disrupting possession and creating turnover opportunities.

The Press Success Rating forms one of the two Component Ratings contributing to the Press Effectiveness Rating.

#### 8.13.2 Football Interpretation

Teams with high Press Success Ratings consistently:

* Force opposition errors.
* Win possession through pressure.
* Prevent controlled progression.
* Increase defensive disruption.
* Convert pressing into measurable outcomes.

The rating reflects the effectiveness of pressing actions rather than their frequency.

#### 8.13.3 Raw Inputs

Representative variables include:

* Forced Turnovers
* Press Successes
* Press-Induced Errors
* Failed Opposition Passes
* Pressed Possession Losses
* Defensive Pressure Outcomes

#### 8.13.4 Engineered Features

Representative features include:

* Press Success Percentage
* Forced Turnover Rate
* Opposition Pass Completion Reduction
* Successful Pressure Index
* Press-Induced Error Rate
* Defensive Outcome Score

#### 8.13.5 Statistical Estimation

Features are adjusted for:

* Opposition Build-Up Rating
* Tactical Style
* Match Context
* Competition Strength

The adjusted observations estimate the latent Press Success Rating.

#### 8.13.6 Machine Learning Model

Candidate algorithms include:

* Gradient Boosted Trees
* Bayesian Hierarchical Models
* Random Forests

#### 8.13.7 Outputs

The model stores:

* Press Success Rating
* Confidence Score
* Rating Variance
* Historical Trend
* Last Updated

#### 8.13.8 Relationship to Press Effectiveness Rating

The Press Success Rating combines with the Press Resistance Disruption Rating to estimate the Press Effectiveness Rating.

### 8.14 Press Resistance Disruption Rating

#### 8.14.1 Purpose

The Press Resistance Disruption Rating measures a team's ability to prevent opponents from successfully overcoming defensive pressure and progressing possession.

The Press Resistance Disruption Rating forms one of the two Component Ratings contributing to the Press Effectiveness Rating.

#### 8.14.2 Football Interpretation

Teams with high Press Resistance Disruption Ratings consistently:

* Prevent successful build-up.
* Force backward passes.
* Force long clearances.
* Reduce opposition progression.
* Terminate possession sequences prematurely.

The rating reflects how effectively pressing disrupts an opponent's intended possession strategy.

#### 8.14.3 Raw Inputs

Representative variables include:

* Forced Long Balls
* Backward Passes Forced
* Build-Up Failures
* Opposition Progression Attempts
* Press Escape Attempts
* Possession Sequence Endings

#### 8.14.4 Engineered Features

Representative features include:

* Build-Up Disruption Index
* Long Ball Frequency Forced
* Backward Pass Percentage
* Opposition Progression Reduction
* Press Escape Failure Rate
* Sequence Termination Rate

#### 8.14.5 Statistical Estimation

Features are adjusted for:

* Opposition Build-Up Rating
* Tactical Style
* Match Context
* Competition Strength

The adjusted observations estimate the latent Press Resistance Disruption Rating.

#### 8.14.6 Machine Learning Model

Candidate algorithms include:

* Gradient Boosted Trees
* Bayesian Hierarchical Models
* Random Forests

#### 8.14.7 Outputs

The model stores:

* Press Resistance Disruption Rating
* Confidence Score
* Rating Variance
* Historical Trend
* Last Updated

#### 8.14.8 Relationship to Press Effectiveness Rating

The Press Resistance Disruption Rating complements the Press Success Rating in estimating the Press Effectiveness Rating.

### 8.15 Rating Calibration and Interpretation

#### 8.15.1 Purpose

All Pressing Ratings produced within the Graham League Prediction Model (GLPM) are calibrated using the universal GLPM Rating Scale introduced in Section 3.15. This common calibration framework ensures that Component Ratings, Domain Ratings and Primary Ratings are directly comparable across teams, competitions and seasons.

Rather than defining a pressing-specific calibration methodology, GLPM applies a unified statistical framework to every latent rating estimated within the model.

#### 8.15.2 GLPM Rating Scale

The Pressing Rating, together with all associated Component Ratings and Domain Ratings, uses the universal GLPM Rating Scale defined in Section 3.15.

This common scale enables consistent interpretation across every rating within GLPM while supporting direct comparison between different aspects of team performance.

#### 8.15.3 Interpretation

Higher Pressing Ratings indicate stronger underlying pressing ability.

For example:

* A high Press Intensity Rating indicates a team consistently applies coordinated defensive pressure across multiple phases of play.
* A high Ball Recovery Rating indicates a team efficiently converts defensive pressure into regained possession.
* A high Press Effectiveness Rating indicates a team consistently disrupts opposition build-up and forces possession losses.
* A high Pressing Rating represents elite collective pressing performance.

Detailed rating classifications and performance bands are defined in Section 3.15.

#### 8.15.4 Calibration Consistency

Using a common calibration framework provides several advantages:

* Consistent interpretation across all GLPM ratings.
* Direct comparison between pressing and other Primary Ratings.
* Stable rating distributions across seasons.
* Simplified communication of model outputs.
* Improved long-term maintainability.

No additional calibration procedures are required beyond those defined in the universal GLPM Rating Calibration framework.

## Part V – Domain Ratings

### 8.16 Press Intensity Rating

#### 8.16.1 Purpose

The Press Intensity Rating measures a team's ability to apply coordinated defensive pressure across different areas of the pitch. It reflects both the frequency and consistency of organised pressing throughout a match.

#### 8.16.2 Component Ratings

The Press Intensity Rating is estimated from:

* High Press Rating
* Mid-Block Press Rating

Together these Component Ratings capture the tactical intensity and structure of a team's pressing approach.

#### 8.16.3 Football Interpretation

Teams with high Press Intensity Ratings consistently:

* Apply pressure in advanced and midfield areas.
* Maintain compact defensive organisation.
* Restrict opposition passing options.
* Force rushed decisions.
* Sustain coordinated pressing throughout matches.

#### 8.16.4 Mathematical Definition

Conceptually,

* PI = f(HP, MB)

where:

* PI = Press Intensity Rating
* HP = High Press Rating
* MB = Mid-Block Press Rating

The relationship is learned from historical match data.

#### 8.16.5 Outputs

The model produces:

* Press Intensity Rating
* Confidence Score
* Rating Variance
* Historical Trend
* Last Updated

#### 8.16.6 Relationship to Pressing Rating

The Press Intensity Rating provides one of the three Domain Ratings contributing to the overall Pressing Rating.

### 8.17 Ball Recovery Rating

#### 8.17.1 Purpose

The Ball Recovery Rating measures a team's ability to regain possession efficiently following defensive pressure.

It evaluates how successfully pressing actions are converted into regained possession and defensive control.

#### 8.17.2 Component Ratings

The Ball Recovery Rating is estimated from:

* Counter-Press Rating
* Recovery Efficiency Rating

Together these Component Ratings evaluate both immediate pressing reactions and the effectiveness of recovering possession.

#### 8.17.3 Football Interpretation

Teams with high Ball Recovery Ratings consistently:

* Win possession quickly.
* Recover loose balls efficiently.
* Prevent opposition transitions.
* Convert pressure into recoveries.
* Sustain defensive momentum.

#### 8.17.4 Mathematical Definition

Conceptually,

* BR = f(CP, RE)

where:

* BR = Ball Recovery Rating
* CP = Counter-Press Rating
* RE = Recovery Efficiency Rating

The weighting of each Component Rating is determined through statistical learning procedures.

#### 8.17.5 Outputs

The model produces:

* Ball Recovery Rating
* Confidence Score
* Rating Variance
* Historical Trend
* Last Updated

#### 8.17.6 Relationship to Pressing Rating

The Ball Recovery Rating provides the second Domain Rating contributing to the overall Pressing Rating.

### 8.18 Press Effectiveness Rating

#### 8.18.1 Purpose

The Press Effectiveness Rating measures how successfully a team's pressing disrupts opposition possession and prevents controlled build-up.

It evaluates the outcomes generated by organised defensive pressure.

#### 8.18.2 Component Ratings

The Press Effectiveness Rating is estimated from:

* Press Success Rating
* Press Resistance Disruption Rating

Together these Component Ratings quantify the effectiveness of pressing actions.

#### 8.18.3 Football Interpretation

Teams with high Press Effectiveness Ratings consistently:

* Force opposition errors.
* Disrupt build-up play.
* Prevent successful progression.
* Reduce possession quality.
* Generate defensive advantages through coordinated pressure.

#### 8.18.4 Mathematical Definition

Conceptually,

* PE = f(PS, PD)

where:

* PE = Press Effectiveness Rating
* PS = Press Success Rating
* PD = Press Resistance Disruption Rating

The weighting of each Component Rating is learned from historical match observations.

#### 8.18.5 Outputs

The model produces:

* Press Effectiveness Rating
* Confidence Score
* Rating Variance
* Historical Trend
* Last Updated

#### 8.18.6 Relationship to Pressing Rating

The Press Effectiveness Rating provides the third Domain Rating contributing to the overall Pressing Rating.

**Chapter Hierarchy Summary**

```text
Historical Match Data
│
▼
Engineered Features
│
▼
──────────────────────────────────
Component Ratings
──────────────────────────────────
High Press
Mid-Block Press
Counter-Press
Recovery Efficiency
Press Success
Press Resistance Disruption
│
▼
──────────────────────────────────
Domain Ratings
──────────────────────────────────
Press Intensity Rating
Ball Recovery Rating
Press Effectiveness Rating
│
▼
Pressing Rating

```

## Part VI – Primary Rating

### 8.19 Pressing Rating Estimation

#### 8.19.1 Purpose

The Pressing Rating represents the highest-level latent measure of a team's overall ability to apply effective defensive pressure within GLPM. It combines the Press Intensity Rating, Ball Recovery Rating and Press Effectiveness Rating into a single estimate of long-term pressing quality.

Rather than measuring pressing through isolated defensive statistics, the Pressing Rating integrates multiple complementary dimensions while accounting for tactical context and statistical uncertainty.

#### 8.19.2 Inputs

The Pressing Rating is estimated from:

* Press Intensity Rating
* Ball Recovery Rating
* Press Effectiveness Rating

Each Domain Rating captures a distinct aspect of pressing performance.

#### 8.19.3 Mathematical Definition

The latent Pressing Rating for team i is defined as:

* PR_i = f(PI_i, BR_i, PE_i)

where:

* PR_i = Pressing Rating
* PI_i = Press Intensity Rating
* BR_i = Ball Recovery Rating
* PE_i = Press Effectiveness Rating

The function f(·) is estimated using statistical and machine learning techniques.

#### 8.19.4 Estimation Process

The Pressing Rating is estimated through four stages:

1. Estimate the six Component Ratings.
2. Aggregate the Component Ratings into the three Domain Ratings.
3. Learn the relationship between the Domain Ratings and future pressing performance.
4. Produce the calibrated Pressing Rating.

Each stage is independently validated before contributing to the next level of the hierarchy.

#### 8.19.5 Model Outputs

The Pressing Rating Model produces:

* Pressing Rating
* Rating Confidence
* Rating Variance
* Historical Trend
* Last Updated
* Prediction Uncertainty

#### 8.19.6 Relationship to the Expected Goals Engine

The Pressing Rating acts as one of the Primary Ratings within the Expected Goals Engine, where it interacts with:

* Attack Rating
* Defence Rating
* Goalkeeper Rating
* Build-Up Rating
* Possession Rating
* Match Context Variables
* Player Availability

Together these variables estimate fixture-specific scoring probabilities while accounting for a team's ability to regain possession and disrupt opponents.

### 8.20 Relationship to the GLPM Framework

#### 8.20.1 Role Within the Rating Architecture

The Pressing Rating is one of the Primary Ratings within GLPM.

It complements the Defence Rating by measuring proactive defensive pressure rather than chance prevention, and complements the Possession Rating by increasing the frequency with which a team regains control of the ball.

#### 8.20.2 Integration with Other Primary Ratings

The Pressing Rating interacts with:

* Attack Rating
* Defence Rating
* Goalkeeper Rating
* Build-Up Rating
* Possession Rating

Each Primary Rating represents a distinct latent football ability while remaining as statistically independent as possible.

#### 8.20.3 Role in Match Prediction

Within the Expected Goals Engine, the Pressing Rating influences:

* Defensive transitions.
* Ball recoveries.
* Field position.
* Opposition build-up quality.
* Expected goal creation following turnovers.
* Match outcome probabilities.

The Pressing Rating therefore contributes directly to every downstream prediction generated by GLPM.

### 8.21 Chapter Summary

This chapter has defined the methodology used to estimate the Pressing Rating within the Graham League Prediction Model.

Beginning with historical match data, raw pressing observations were transformed into engineered features before being used to estimate six specialised Component Ratings:

* High Press Rating
* Mid-Block Press Rating
* Counter-Press Rating
* Recovery Efficiency Rating
* Press Success Rating
* Press Resistance Disruption Rating

These Component Ratings were then aggregated into three Domain Ratings:

* Press Intensity Rating
* Ball Recovery Rating
* Press Effectiveness Rating

Finally, the Domain Ratings were combined to estimate the latent Pressing Rating, which serves as one of the Primary Ratings within GLPM and contributes directly to the Expected Goals Engine.

By modelling pressing as a hierarchy of latent abilities rather than isolated defensive actions, GLPM provides a robust, interpretable and extensible representation of a team's ability to regain possession and disrupt opponents.

**Chapter 8 Hierarchy Summary**

```text
Historical Match Data 
│
▼
Engineered Features
│
▼
────────────────────────────────────
Component Ratings
────────────────────────────────────
High Press
Mid-Block Press
Counter-Press
Recovery Efficiency
Press Success
Press Resistance Disruption
│
▼
────────────────────────────────────
Domain Ratings
────────────────────────────────────
Press Intensity Rating
Ball Recovery Rating
Press Effectiveness Rating
│
▼
Pressing Rating
│
▼
Expected Goals Engine

```
