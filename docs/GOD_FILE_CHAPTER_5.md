# Chapter 5 – Goalkeeper Rating

## Part I – Foundations

### 5.1 Purpose

#### 5.1.1 Objective
The Goalkeeper Rating represents the primary latent measure of a goalkeeper\'s overall performance within the Graham League Prediction Model (GLPM). It estimates the underlying ability of a goalkeeper to prevent goals, control the defensive penalty area and contribute to team possession through distribution and proactive defensive actions.

Unlike traditional goalkeeper statistics, which often rely heavily on save percentage or goals conceded, the Goalkeeper Rating models goalkeeping as a collection of repeatable skills that contribute to both defensive stability and attacking build-up.

The Goalkeeper Rating forms one of the Primary Ratings within GLPM and interacts with the Defence Rating, Build-Up Rating and Expected Goals Engine to improve fixture-level predictions.

#### 5.1.2 Scope
The Goalkeeper Rating captures long-term goalkeeping performance by integrating multiple dimensions of modern goalkeeping, including:
* Shot stopping.
* Penalty saving.
* Control of the penalty area.
* Ball distribution.
* Sweeper actions.

These goalkeeping processes are estimated independently before being combined within a hierarchical modelling framework.

#### 5.1.3 Outputs
The Goalkeeper Rating Model produces:
* Goalkeeper Rating
* Goal Prevention Rating
* Goalkeeper Involvement Rating
* Component Ratings
* Rating Confidence
* Rating Variance
* Historical Trend
* Last Updated Timestamp

These outputs provide both an estimate of goalkeeper quality and measures of confidence and uncertainty associated with each estimate.

### 5.2 Philosophy

#### 5.2.1 Measuring Goalkeeping Ability
Goalkeepers influence football matches in ways that extend well beyond simply making saves. Traditional goalkeeper statistics such as save percentage or goals conceded are heavily influenced by defensive structure, shot quality and random variation. Consequently, these measures often fail to isolate the goalkeeper\'s individual contribution.

GLPM therefore models goalkeeping as a collection of repeatable underlying processes that describe how goalkeepers prevent goals, manage defensive situations and contribute to team possession.

Rather than evaluating isolated outcomes, the model estimates the latent abilities that consistently influence goalkeeper performance across multiple matches and competitions.

#### 5.2.2 Hierarchical Goalkeeping Architecture
The Goalkeeper Rating is estimated using a hierarchical framework.

Raw match observations are transformed into engineered features that estimate specialised Component Ratings. Related Component Ratings are then combined into broader Domain Ratings before producing the overall Goalkeeper Rating.

This structure improves interpretability while reducing redundancy between correlated goalkeeping statistics.

The hierarchy consists of three layers:

**Component Ratings**
* Shot Stopping Rating
* Area Command Rating
* Distribution Rating
* Sweeper Rating
* Penalty Rating

↓

**Domain Ratings**
* Goal Prevention Rating
* Goalkeeper Involvement Rating

↓

**Primary Rating**
* Goalkeeper Rating

#### 5.2.3 Goal Prevention Rating
The Goal Prevention Rating measures a goalkeeper\'s ability to directly prevent goals through shot stopping and penalty saving.

It combines:
* Shot Stopping Rating
* Penalty Rating

Goalkeepers with high Goal Prevention Ratings consistently outperform expectations by preventing goals from shots that would typically result in scores.

#### 5.2.4 Goalkeeper Involvement Rating
The Goalkeeper Involvement Rating measures a goalkeeper\'s contribution beyond traditional shot stopping.

It combines:
* Area Command Rating
* Distribution Rating
* Sweeper Rating

This Domain Rating captures proactive goalkeeping behaviours that influence both defensive organisation and attacking build-up.

#### 5.2.5 Why a Hierarchical Model?
Modern goalkeeping requires excellence across multiple specialised skills. A goalkeeper may excel as a shot stopper while contributing relatively little in possession, or may be exceptional with the ball while providing only average shot-stopping ability.

Estimating these abilities independently provides several advantages:
* Greater interpretability of goalkeeper strengths and weaknesses.
* Reduced multicollinearity between related statistics.
* Improved statistical robustness.
* Modular model development and future expansion.
* More accurate estimation of latent goalkeeper ability.

The hierarchical framework also allows additional goalkeeping metrics to be incorporated as richer tracking data become available.

### 5.3 Mathematical Definition

#### 5.3.1 Purpose
The Goalkeeper Rating is estimated through a hierarchical sequence of latent ratings.

Historical match observations are transformed into engineered features, which are used to estimate Component Ratings. These Component Ratings are then aggregated into Domain Ratings before producing the final Goalkeeper Rating.

#### 5.3.2 Hierarchical Structure
The Goalkeeper Rating consists of two Domain Ratings.

| Symbol | Domain Rating | Component Ratings |
| :--- | :--- | :--- |
| GP | Goal Prevention Rating | Shot Stopping, Penalty |
| GI | Goalkeeper Involvement Rating | Area Command, Distribution, Sweeper |

#### 5.3.3 Component Ratings
The five Component Ratings are:

| Symbol | Component Rating |
| :--- | :--- |
| SS | Shot Stopping Rating |
| AC | Area Command Rating |
| DI | Distribution Rating |
| SW | Sweeper Rating |
| PE | Penalty Rating |

#### 5.3.4 Domain Rating Estimation
The Domain Ratings are estimated as:
* GP = f(SS, PE)
* GI = f(AC, DI, SW)

where each function f(·) is learned from historical data using statistical and machine learning techniques rather than predefined weighting schemes.

#### 5.3.5 Goalkeeper Rating Estimation
The overall Goalkeeper Rating is estimated as:
* GK = f(GP, GI)

where:
* GK = Goalkeeper Rating
* GP = Goal Prevention Rating
* GI = Goalkeeper Involvement Rating

This hierarchical formulation captures both traditional goal prevention and the broader tactical responsibilities of modern goalkeepers.

#### 5.3.6 Relationship to Expected Goals
The Goalkeeper Rating contributes directly to the Expected Goals Engine by representing the goalkeeper\'s expected influence on shot outcomes.

For a given fixture, expected goals are estimated as:
* xG = g(A, D, GK, T, X, P)

where:
* A = Attack Rating
* D = Defence Rating
* GK = Goalkeeper Rating
* T = Tactical Interaction Effects
* X = Match Context Variables
* P = Player Availability

Including the Goalkeeper Rating allows GLPM to distinguish between defensive performance attributable to the defensive unit and performance attributable to the goalkeeper.

### 5.4 Football Interpretation

#### 5.4.1 Interpreting the Goalkeeper Rating
The Goalkeeper Rating represents a goalkeeper\'s underlying ability rather than observed outcomes such as saves made or goals conceded.

A high Goalkeeper Rating indicates that a goalkeeper consistently:
* Prevents goals through superior shot stopping.
* Commands the penalty area effectively.
* Distributes the ball accurately under pressure.
* Contributes to build-up play.
* Acts proactively outside the penalty area.

Conversely, a lower Goalkeeper Rating suggests reduced effectiveness across one or more of these core goalkeeping responsibilities.

#### 5.4.2 Relationship Between the Domain Ratings
Each Domain Rating captures a distinct aspect of goalkeeping performance.

Goal Prevention Rating measures a goalkeeper\'s direct contribution to preventing goals through shot stopping and penalty saves.
Goalkeeper Involvement Rating measures a goalkeeper\'s broader contribution to team performance through area command, distribution and proactive defensive actions.

Together, these Domain Ratings provide a comprehensive representation of goalkeeper performance that reflects the demands of the modern game.

#### 5.4.3 Role Within GLPM
The Goalkeeper Rating is one of the Primary Ratings within GLPM.

It complements the Attack and Defence Ratings by explicitly modelling the individual contribution of the goalkeeper, allowing GLPM to separate goalkeeper performance from the collective performance of the defensive unit.

Combined with the other Primary Ratings, the Goalkeeper Rating contributes to the estimation of fixture-specific expected goals, scoreline distributions and match outcome probabilities.

### 5.5 Data Sources and Raw Inputs

#### 5.5.1 Purpose
The Goalkeeper Rating is estimated using a comprehensive set of historical match observations describing a goalkeeper\'s performance across multiple dimensions of play. These observations capture both traditional goalkeeping actions and the broader responsibilities of the modern goalkeeper.

Rather than relying on individual statistics such as saves or clean sheets, GLPM integrates numerous goalkeeping variables that collectively describe underlying goalkeeper ability.

The raw observations form the foundation for feature engineering and subsequent estimation of the five goalkeeping Component Ratings.

#### 5.5.2 Data Sources
Historical goalkeeper data are collected from structured football datasets, including event-based and tracking data where available.

Typical sources include:
* Event Data
* Match Statistics
* Player Tracking Data
* Shot Event Data
* Goalkeeping Event Logs
* Possession Sequences

Each observation is timestamped and linked to the relevant goalkeeper, team, opponent, competition and match context.

#### 5.5.3 Goalkeeping Data Categories
Raw observations are organised into the following categories:

| Category | Example Variables |
| :--- | :--- |
| Shot Stopping | Saves, Save Percentage, Post-Shot xG Faced, Goals Prevented |
| Penalties | Penalties Faced, Penalties Saved, Penalty xG |
| Area Command | Crosses Faced, Cross Claims, Punches, High Claims |
| Distribution | Pass Completion, Long Pass Accuracy, Launch Success, Progressive Passes |
| Sweeper Actions | Defensive Actions Outside Box, Clearances, Through-Ball Interceptions, Sweeper Recoveries |

These observations describe the full range of modern goalkeeping responsibilities.

#### 5.5.4 Post-Shot Expected Goals
Post-Shot Expected Goals (PSxG) estimates the probability that a shot will result in a goal after it has been struck. Unlike traditional Expected Goals (xG), which evaluates chance quality at the moment of the shot, PSxG incorporates characteristics of the shot itself, including placement, trajectory and velocity where available.

Because PSxG reflects the difficulty of the save rather than merely the quality of the chance, it provides a more accurate basis for evaluating goalkeeper performance.

Throughout GLPM, PSxG serves as the primary benchmark for estimating shot-stopping ability and forms a core input to the Shot Stopping Rating.

#### 5.5.5 Data Granularity
Goalkeeper observations may be recorded at several levels:
* Match Level
* Shot Level
* Possession Level
* Event Level
* Player Level

Shot-level and event-level observations provide the greatest precision when estimating latent goalkeeping ability.

### 5.6 Data Preparation and Cleaning

#### 5.6.1 Purpose
Raw goalkeeper data frequently contain inconsistencies arising from differences in data providers, competition standards and event definitions.

The preparation stage standardises these observations before feature engineering and statistical estimation.

#### 5.6.2 Data Cleaning
The cleaning process includes:
* Removal of duplicate events.
* Validation of shot sequences.
* Standardisation of goalkeeper identifiers.
* Correction of event timestamps.
* Verification of shot outcomes.
* Removal of invalid observations.

Quality assurance procedures ensure only reliable observations contribute to rating estimation.

#### 5.6.3 Missing Data
Missing goalkeeper observations are handled using appropriate statistical techniques.
Possible approaches include:
* Bayesian Imputation
* Historical Goalkeeper Priors
* League-Level Priors
* Model-Based Imputation

The chosen method depends on the completeness and reliability of the available data.

#### 5.6.4 Normalisation
To improve comparability across competitions and tactical systems, variables are normalised where appropriate.

Typical transformations include:
* Per 90 Minutes
* Per Shot Faced
* Per Cross Faced
* Per Possession
* Per Distribution Attempt

These transformations reduce bias arising from differences in team playing style and match tempo.

#### 5.6.5 Outlier Detection
Extreme observations are evaluated using robust statistical methods.
Potential outliers include:
* Matches with unusually high shot volumes.
* Extremely unbalanced scorelines.
* Exceptional weather conditions.
* Data collection anomalies.

Where appropriate, observations may be winsorised or assigned lower statistical weight during estimation.

### 5.7 Feature Engineering

#### 5.7.1 Purpose
Feature engineering transforms raw goalkeeper observations into statistically informative variables that better represent the underlying skills being modelled.

These engineered features provide the inputs for estimating the five Component Ratings.

#### 5.7.2 Shot Stopping Features
Shot stopping is primarily evaluated relative to Post-Shot Expected Goals (PSxG). By comparing the probability of a shot resulting in a goal after it has been struck with the observed outcome, GLPM estimates the goalkeeper\'s underlying shot-stopping ability while accounting for shot difficulty.

Representative engineered features include:
* Goals Prevented (PSxG − Goals Conceded)
* PSxG Faced per 90
* Save Percentage
* PSxG Save Percentage
* High-Difficulty Save Rate
* One-on-One Save Percentage
* Rebound Prevention Rate

Notice that PSxG becomes the centrepiece, not Save Percentage.

#### 5.7.3 Area Command Features
Examples include:
* Cross Claim Success Rate
* Punch Success Percentage
* High Ball Success Rate
* Cross Intervention Rate
* Aerial Command Index
* Defensive Area Control

These variables quantify a goalkeeper\'s effectiveness in managing aerial threats and controlling the penalty area.

#### 5.7.4 Distribution Features
Representative variables include:
* Pass Completion Percentage
* Progressive Passing Rate
* Long Pass Accuracy
* Distribution Retention Rate
* Build-Up Contribution Index
* Progressive Distance per Distribution

These features measure a goalkeeper\'s contribution to possession and attacking build-up.

#### 5.7.5 Sweeper Features
Examples include:
* Defensive Actions Outside Box
* Sweeper Clearances
* Through-Ball Interceptions
* Average Defensive Distance from Goal
* Sweeper Intervention Rate
* Recovery Success Rate

These variables capture the goalkeeper\'s ability to defend proactively beyond the penalty area.

#### 5.7.6 Penalty Features
Representative features include:
* Penalty Save Percentage
* Goals Prevented from Penalties
* Correct Dive Direction Percentage
* Penalty Reaction Efficiency
* Penalty xG Saved

These features evaluate performance in one of football\'s most specialised situations.

#### 5.7.7 Feature Scaling
Following feature engineering, all variables are transformed using consistent scaling procedures.
Typical methods include:
* Standardisation
* Robust Scaling
* Logarithmic Transformation
* Quantile Normalisation

The selected transformation depends on the statistical characteristics of each feature.

### 5.8 Context and Opposition Adjustment

#### 5.8.1 Purpose
Goalkeeper statistics are strongly influenced by the quality of the defensive unit, the difficulty of shots faced and the tactical characteristics of opposing teams.

To estimate latent goalkeeper ability rather than observed outcomes, GLPM adjusts engineered features for contextual influences before estimating Component Ratings.

#### 5.8.2 Defensive Team Adjustment
Each goalkeeper\'s observations are adjusted to account for the quality of the defensive unit in front of them.

Representative adjustments include:
* Team Defence Rating
* Prevention Rating
* Protection Rating
* Control Rating

This enables GLPM to separate the goalkeeper\'s contribution from that of the team\'s defensive structure.

#### 5.8.3 Shot Difficulty Adjustment
Shot-stopping observations are adjusted using Post-Shot Expected Goals (PSxG), which provides the primary measure of save difficulty within GLPM.

Additional adjustments incorporate:
* Shot Distance
* Shot Angle
* Shot Velocity
* Shot Placement
* Body Part Used
* Defensive Pressure
* Number of Defenders Between Shooter and Goal

These adjustments ensure that goalkeepers facing more difficult shots are evaluated fairly.

#### 5.8.4 Match Context
Additional contextual adjustments include:
* Home Advantage
* Match State
* Rest Days
* Fixture Congestion
* Weather Conditions
* Competition Type
* Playing Surface

These variables account for external factors that influence goalkeeper performance independently of underlying ability.

#### 5.8.5 Adjusted Goalkeeping Features
Following contextual adjustment, the resulting engineered features provide unbiased estimates of the goalkeeper\'s underlying abilities.

These adjusted features form the inputs to the five Component Rating models introduced in Part III.

**Chapter Pipeline Summary**

```text
Historical Match Data
│
▼
Raw Goalkeeping Observations
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
Adjusted Goalkeeping Features
│
▼
Component Rating Models
│
▼
Goal Prevention Rating
Goalkeeper Involvement Rating
│
▼
Goalkeeper Rating

```

### 5.9 Shot Stopping Rating

#### 5.9.1 Purpose

The Shot Stopping Rating measures a goalkeeper's underlying ability to prevent goals from shots faced. Rather than evaluating save percentage alone, the model estimates performance relative to the quality and difficulty of each shot using Post-Shot Expected Goals (PSxG).

This approach isolates the goalkeeper's contribution from defensive performance and provides a more accurate estimate of repeatable shot-stopping ability.

The Shot Stopping Rating forms one of the two Component Ratings used to estimate the Goal Prevention Rating.

#### 5.9.2 Football Interpretation

Goalkeepers with high Shot Stopping Ratings consistently:

* Prevent more goals than expected.
* Save high-difficulty shots.
* Reduce rebound opportunities.
* Perform consistently against high-quality finishing.
* Maintain above-average shot-stopping over long periods.

The rating reflects the goalkeeper's ability to outperform the expected outcome of shots faced.

#### 5.9.3 Raw Inputs

Representative variables include:

* Shots on Target Faced
* Goals Conceded
* Saves
* Post-Shot Expected Goals (PSxG)
* Save Percentage
* Rebounds Allowed
* One-on-One Situations
* Shot Distance
* Shot Angle

#### 5.9.4 Engineered Features

Shot stopping is evaluated relative to Post-Shot Expected Goals (PSxG), which provides the primary measure of save difficulty within GLPM.

Representative engineered features include:

* Goals Prevented (PSxG − Goals Conceded)
* PSxG Faced per 90
* Save Percentage
* PSxG Save Percentage
* High-Difficulty Save Rate
* One-on-One Save Percentage
* Rebound Prevention Rate

#### 5.9.5 Statistical Estimation

Features are adjusted for:

* Team Defence Rating
* Shot Quality
* Match Context
* Opposition Attack Rating
* Home Advantage

The adjusted observations estimate the latent Shot Stopping Rating.

#### 5.9.6 Machine Learning Model

Candidate algorithms include:

* Gradient Boosted Trees
* Bayesian Hierarchical Models
* Random Forests
* Elastic Net Regression

The final model is selected according to predictive accuracy, calibration and long-term stability.

#### 5.9.7 Outputs

The Shot Stopping Model stores:

* Shot Stopping Rating
* Confidence Score
* Rating Variance
* Historical Trend
* Last Updated

#### 5.9.8 Relationship to Goal Prevention Rating

The Shot Stopping Rating combines with the Penalty Rating to estimate the goalkeeper's Goal Prevention Rating.

### 5.10 Area Command Rating

#### 5.10.1 Purpose

The Area Command Rating measures a goalkeeper's ability to control the penalty area during aerial situations and crosses. It evaluates decision-making, timing and execution when claiming, punching or intercepting deliveries into dangerous areas.

The Area Command Rating forms one of the three Component Ratings contributing to the Goalkeeper Involvement Rating.

#### 5.10.2 Football Interpretation

Goalkeepers with high Area Command Ratings consistently:

* Claim crosses confidently.
* Win aerial contests.
* Reduce second-ball opportunities.
* Organise defenders effectively.
* Dominate the penalty area.

The rating reflects a goalkeeper's ability to control aerial situations and minimise defensive instability.

#### 5.10.3 Raw Inputs

Representative variables include:

* Crosses Faced
* Cross Claims
* Punches
* High Claims
* Aerial Duels
* Defensive Headers
* Crosses Successfully Cleared

#### 5.10.4 Engineered Features

Examples include:

* Cross Claim Success Rate
* Punch Success Percentage
* High Ball Success Rate
* Cross Intervention Rate
* Aerial Command Index
* Defensive Area Control

#### 5.10.5 Statistical Estimation

Features are adjusted for:

* Opposition Crossing Quality
* Team Defensive Structure
* Match Context
* Home Advantage

The adjusted observations estimate the latent Area Command Rating.

#### 5.10.6 Machine Learning Model

Candidate algorithms include:

* Gradient Boosted Trees
* Bayesian Hierarchical Models
* Random Forests

#### 5.10.7 Outputs

The model stores:

* Area Command Rating
* Confidence Score
* Rating Variance
* Historical Trend
* Last Updated

#### 5.10.8 Relationship to Goalkeeper Involvement Rating

The Area Command Rating contributes to the estimation of the Goalkeeper Involvement Rating.

### 5.11 Distribution Rating

#### 5.11.1 Purpose

The Distribution Rating measures a goalkeeper's ability to contribute to possession retention and attacking build-up through effective ball distribution.

The rating evaluates both short and long distribution while accounting for tactical context and opposition pressure.

It forms one of the three Component Ratings contributing to the Goalkeeper Involvement Rating.

#### 5.11.2 Football Interpretation

Goalkeepers with high Distribution Ratings consistently:

* Complete accurate passes.
* Progress possession effectively.
* Break opposition pressing structures.
* Launch accurate long passes.
* Support controlled build-up play.

#### 5.11.3 Raw Inputs

Representative variables include:

* Pass Completion
* Short Pass Completion
* Long Pass Accuracy
* Progressive Passes
* Launches
* Goal Kicks
* Distribution Under Pressure

#### 5.11.4 Engineered Features

Examples include:

* Progressive Distribution Rate
* Long Distribution Success
* Build-Up Contribution Index
* Distribution Retention Rate
* Pressure Passing Success
* Progressive Distance per Distribution

#### 5.11.5 Statistical Estimation

Adjustments account for:

* Team Build-Up Rating
* Opposition Pressing Rating
* Match Context
* Tactical Style

#### 5.11.6 Machine Learning Model

Candidate algorithms include:

* Gradient Boosted Trees
* Bayesian Regression
* Random Forests

#### 5.11.7 Outputs

* Distribution Rating
* Confidence Score
* Rating Variance
* Historical Trend
* Last Updated

#### 5.11.8 Relationship to Goalkeeper Involvement Rating

The Distribution Rating contributes to the estimation of the Goalkeeper Involvement Rating.

### 5.12 Sweeper Rating

#### 5.12.1 Purpose

The Sweeper Rating measures a goalkeeper's effectiveness in defending proactively outside the penalty area. It evaluates anticipation, positioning and decision-making when intervening before attacking situations develop.

The Sweeper Rating forms one of the three Component Ratings contributing to the Goalkeeper Involvement Rating.

#### 5.12.2 Football Interpretation

Goalkeepers with high Sweeper Ratings consistently:

* Intercept through balls.
* Clear danger outside the penalty area.
* Support a high defensive line.
* Reduce one-on-one situations.
* Recover possession before attacks develop.

#### 5.12.3 Raw Inputs

Representative variables include:

* Defensive Actions Outside Box
* Sweeper Clearances
* Through-Ball Interceptions
* Recoveries Outside Box
* Average Defensive Position
* Off-Line Interventions

#### 5.12.4 Engineered Features

Examples include:

* Sweeper Intervention Rate
* Average Defensive Distance
* Through-Ball Prevention
* Recovery Success
* Proactive Defensive Index

#### 5.12.5 Statistical Estimation

Features are adjusted for:

* Defensive Line Height
* Opposition Build-Up Rating
* Match Context
* Team Tactical Style

#### 5.12.6 Machine Learning Model

Candidate algorithms include:

* Gradient Boosted Trees
* Bayesian Hierarchical Models
* Random Forests

#### 5.12.7 Outputs

* Sweeper Rating
* Confidence Score
* Rating Variance
* Historical Trend
* Last Updated

#### 5.12.8 Relationship to Goalkeeper Involvement Rating

The Sweeper Rating contributes to the estimation of the Goalkeeper Involvement Rating.

### 5.13 Penalty Rating

#### 5.13.1 Purpose

The Penalty Rating measures a goalkeeper's effectiveness when facing penalty kicks. Although penalties occur relatively infrequently, they represent a specialised skill requiring anticipation, reaction speed and decision-making.

The Penalty Rating forms the second Component Rating contributing to the Goal Prevention Rating.

#### 5.13.2 Football Interpretation

Goalkeepers with high Penalty Ratings consistently:

* Save more penalties than expected.
* Read penalty takers effectively.
* Dive in the correct direction.
* Maintain composure under pressure.
* Perform consistently in high-pressure situations.

#### 5.13.3 Raw Inputs

Representative variables include:

* Penalties Faced
* Penalties Saved
* Penalty Goals Conceded
* Penalty Placement
* Dive Direction
* Penalty PSxG (where available)

#### 5.13.4 Engineered Features

Examples include:

* Penalty Save Percentage
* Goals Prevented from Penalties
* Correct Dive Direction Percentage
* Penalty Reaction Efficiency
* Penalty PSxG Saved

#### 5.13.5 Statistical Estimation

Adjustments account for:

* Penalty Taker Quality
* Match Importance
* Competition Level
* Historical Sample Size

Because penalties are relatively rare events, Bayesian shrinkage techniques are applied to reduce estimation variance and prevent overfitting to small sample sizes.

#### 5.13.6 Machine Learning Model

Candidate algorithms include:

* Bayesian Hierarchical Models
* Gradient Boosted Trees
* Elastic Net Regression

Bayesian methods are particularly valuable for this component due to the limited number of observations available for most goalkeepers.

#### 5.13.7 Outputs

The model stores:

* Penalty Rating
* Confidence Score
* Rating Variance
* Historical Trend
* Last Updated

#### 5.13.8 Relationship to Goal Prevention Rating

The Penalty Rating complements the Shot Stopping Rating by measuring performance in one of football's most specialised defensive situations. Together, these Component Ratings estimate the goalkeeper's Goal Prevention Rating.

### 5.14 Rating Calibration and Interpretation

#### 5.14.1 Purpose

All Goalkeeper Ratings produced within the Graham League Prediction Model (GLPM) are calibrated using the standard GLPM Rating Scale introduced in Section 3.15. This common calibration framework ensures that Component Ratings, Domain Ratings and Primary Ratings are directly comparable across goalkeepers, teams, competitions and seasons.

Rather than defining a separate calibration methodology for goalkeeping, GLPM applies a unified statistical framework to every latent rating estimated within the model.

#### 5.14.2 GLPM Rating Scale

The Goalkeeper Rating, together with all associated Component Ratings and Domain Ratings, uses the universal GLPM Rating Scale defined in Section 3.15.

This common scale enables consistent interpretation across every rating within GLPM while supporting direct comparison between different aspects of player and team performance.

#### 5.14.3 Interpretation

Higher Goalkeeper Ratings indicate stronger underlying goalkeeping ability.

For example:

* A high Shot Stopping Rating indicates a goalkeeper consistently prevents more goals than expected relative to shot difficulty.
* A high Goal Prevention Rating indicates exceptional ability to prevent goals through shot stopping and penalty saving.
* A high Goalkeeper Involvement Rating indicates significant contribution through distribution, area command and proactive defensive actions.
* A high Goalkeeper Rating represents elite overall goalkeeping performance across all phases of play.

Detailed rating classifications and performance bands are defined in Section 3.15.

#### 5.14.4 Calibration Consistency

Using a common calibration framework provides several advantages:

* Consistent interpretation across all GLPM ratings.
* Direct comparison between goalkeepers and team ratings.
* Stable rating distributions across seasons.
* Simplified communication of model outputs.
* Improved long-term maintainability.

No additional calibration procedures are required beyond those defined in the universal GLPM Rating Calibration framework.

## Part V – Domain Ratings

### 5.15 Goal Prevention Rating

#### 5.15.1 Purpose

The Goal Prevention Rating measures a goalkeeper's ability to directly prevent goals through shot stopping and penalty saving. It captures the goalkeeper's effectiveness in situations where the primary objective is to stop the ball from entering the goal.

This Domain Rating represents the traditional core responsibility of goalkeeping while accounting for shot difficulty and statistical uncertainty.

#### 5.15.2 Component Ratings

The Goal Prevention Rating is estimated from:

* Shot Stopping Rating
* Penalty Rating

Together these Component Ratings quantify a goalkeeper's ability to outperform expected outcomes during direct scoring opportunities.

#### 5.15.3 Football Interpretation

Goalkeepers with high Goal Prevention Ratings consistently:

* Prevent more goals than expected.
* Save difficult shots.
* Perform well in one-on-one situations.
* Save penalties above expectation.
* Produce reliable goal prevention over long periods.

The Goal Prevention Rating reflects the goalkeeper's direct influence on reducing opposition scoring.

#### 5.15.4 Mathematical Definition

Conceptually,

* GP = f(SS, PE)

where:

* GP = Goal Prevention Rating
* SS = Shot Stopping Rating
* PE = Penalty Rating

The relationship is learned from historical data using statistical and machine learning methods.

#### 5.15.5 Outputs

The Goal Prevention Model produces:

* Goal Prevention Rating
* Confidence Score
* Rating Variance
* Historical Trend
* Last Updated

#### 5.15.6 Relationship to Goalkeeper Rating

The Goal Prevention Rating provides one of the two Domain Ratings contributing to the overall Goalkeeper Rating.

### 5.16 Goalkeeper Involvement Rating

#### 5.16.1 Purpose

The Goalkeeper Involvement Rating measures a goalkeeper's contribution beyond traditional shot stopping. It captures how effectively the goalkeeper influences possession, defensive organisation and proactive defending through involvement in open play.

#### 5.16.2 Component Ratings

The Goalkeeper Involvement Rating is estimated from:

* Area Command Rating
* Distribution Rating
* Sweeper Rating

These complementary Component Ratings evaluate a goalkeeper's contribution during phases of play where technical ability, positioning and decision-making influence overall team performance.

#### 5.16.3 Football Interpretation

Goalkeepers with high Goalkeeper Involvement Ratings consistently:

* Control the penalty area.
* Distribute possession effectively.
* Support build-up play.
* Defend proactively outside the penalty area.
* Improve team stability through decision-making and positioning.

Rather than focusing solely on preventing goals, this Domain Rating captures the goalkeeper's wider tactical contribution.

#### 5.16.4 Mathematical Definition

Conceptually,

* GI = f(AC, DI, SW)

where:

* GI = Goalkeeper Involvement Rating
* AC = Area Command Rating
* DI = Distribution Rating
* SW = Sweeper Rating

The weighting of each Component Rating is determined through statistical learning and optimisation procedures.

#### 5.16.5 Outputs

The Goalkeeper Involvement Model produces:

* Goalkeeper Involvement Rating
* Confidence Score
* Rating Variance
* Historical Trend
* Last Updated

#### 5.16.6 Relationship to Goalkeeper Rating

The Goalkeeper Involvement Rating provides the second Domain Rating contributing to the estimation of the Goalkeeper Rating.

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
Shot Stopping
Area Command
Distribution
Sweeper
Penalty
│
▼
──────────────────────────────────
Domain Ratings
──────────────────────────────────
Goal Prevention Rating
Goalkeeper Involvement Rating
│
▼
Goalkeeper Rating 

```

## Part VI – Primary Rating

### 5.17 Goalkeeper Rating Estimation

#### 5.17.1 Purpose

The Goalkeeper Rating represents the highest-level latent measure of a goalkeeper's overall ability within GLPM. It combines the Goal Prevention Rating and Goalkeeper Involvement Rating into a single estimate of long-term goalkeeping quality.

Unlike traditional goalkeeper metrics based on save percentage or clean sheets, the Goalkeeper Rating integrates multiple independent aspects of goalkeeping while accounting for contextual factors and statistical uncertainty.

#### 5.17.2 Inputs

The Goalkeeper Rating is estimated from:

* Goal Prevention Rating
* Goalkeeper Involvement Rating

Each Domain Rating captures a distinct dimension of goalkeeper performance.

#### 5.17.3 Mathematical Definition

The latent Goalkeeper Rating for goalkeeper i is defined as

* GK_i = f(GP_i, GI_i)

where:

* GK_i = Goalkeeper Rating
* GP_i = Goal Prevention Rating
* GI_i = Goalkeeper Involvement Rating

The function f(·) is learned from historical data using statistical and machine learning techniques.

#### 5.17.4 Estimation Process

The Goalkeeper Rating is estimated through four stages:

1. Estimate the five Component Ratings.
2. Aggregate the Component Ratings into the two Domain Ratings.
3. Learn the relationship between the Domain Ratings and future goalkeeper performance.
4. Produce the calibrated Goalkeeper Rating.

Each stage is independently validated before contributing to the next level of the hierarchy.

#### 5.17.5 Model Outputs

The Goalkeeper Rating Model produces:

* Goalkeeper Rating
* Rating Confidence
* Rating Variance
* Historical Trend
* Last Updated
* Prediction Uncertainty

These outputs provide both an estimate of goalkeeper quality and measures of estimation reliability.

#### 5.17.6 Relationship to the Expected Goals Engine

The Goalkeeper Rating does not predict goals prevented directly.

Instead, it acts as one of the principal inputs to the Expected Goals Engine, where it interacts with:

* Opposition Attack Rating
* Team Defence Rating
* Tactical Interaction Engine
* Match Context Variables
* Player Availability

Together, these variables estimate fixture-specific scoring probabilities while explicitly accounting for goalkeeper influence.

### 5.18 Relationship to the GLPM Framework

#### 5.18.1 Role Within the Rating Architecture

The Goalkeeper Rating is one of the Primary Ratings within GLPM.

It complements the Attack and Defence Ratings by explicitly modelling the individual contribution of the goalkeeper. This separation enables GLPM to distinguish between defensive performance attributable to the team's defensive structure and that attributable to the goalkeeper.

#### 5.18.2 Integration with Other Primary Ratings

The Goalkeeper Rating interacts with several other Primary Ratings, including:

* Attack Rating
* Defence Rating
* Build-Up Rating
* Pressing Rating
* Possession Rating

Each rating captures a distinct aspect of football performance while remaining statistically independent wherever possible.

#### 5.18.3 Role in Match Prediction

Within the Expected Goals Engine, the Goalkeeper Rating influences:

* Goal conversion probabilities.
* Goals prevented above expectation.
* Scoreline distributions.
* Match outcome probabilities.
* Over/Under goal probabilities.
* Both Teams to Score probabilities.

The Goalkeeper Rating therefore contributes directly to every downstream prediction generated by GLPM.

### 5.19 Chapter Summary

This chapter has defined the methodology used to estimate the Goalkeeper Rating within the Graham League Prediction Model.

Beginning with historical match data, raw goalkeeping observations were transformed into engineered features before being used to estimate five specialised Component Ratings:

* Shot Stopping Rating
* Area Command Rating
* Distribution Rating
* Sweeper Rating
* Penalty Rating

These Component Ratings were then aggregated into two Domain Ratings:

* Goal Prevention Rating
* Goalkeeper Involvement Rating

Finally, the Domain Ratings were combined to estimate the latent Goalkeeper Rating, which serves as one of the Primary Ratings within GLPM and contributes directly to the Expected Goals Engine.

By modelling goalkeeping as a hierarchy of latent abilities rather than relying on traditional summary statistics, GLPM provides a robust, interpretable and extensible representation of goalkeeper performance across teams, competitions and seasons.

**Chapter 5 Hierarchy Summary**

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
Shot Stopping
Area Command
Distribution
Sweeper
Penalty
│
▼
────────────────────────────────────
Domain Ratings
────────────────────────────────────
Goal Prevention Rating
Goalkeeper Involvement Rating
│
▼
Goalkeeper Rating
│
▼
Expected Goals Engine

```