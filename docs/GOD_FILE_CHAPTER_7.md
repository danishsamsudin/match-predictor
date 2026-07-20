# Chapter 7 – Possession Rating

## Part I – Foundations

### 7.1 Purpose

#### 7.1.1 Objective

The Possession Rating is the Primary Rating within the Graham League Prediction Model (GLPM) that estimates a team's underlying ability to control possession throughout a match. It measures how effectively a team retains the ball, controls territory and dictates the tempo of play while maintaining tactical stability.

Rather than relying solely on possession percentage, the Possession Rating captures the repeatable processes that enable teams to sustain possession, control the flow of the game and limit opposition opportunities to regain the ball.

#### 7.1.2 Scope

The Possession Rating evaluates three fundamental aspects of possession play:

* Retaining possession through secure ball circulation.
* Controlling territory through effective positioning and spatial occupation.
* Dictating the rhythm and tempo of the game while in possession.

These abilities are estimated independently before being combined within GLPM's hierarchical rating framework.

#### 7.1.3 Outputs

The Possession Rating Model produces:

* Possession Rating
* Ball Retention Rating
* Territorial Control Rating
* Possession Control Rating
* Six Component Ratings
* Rating Confidence
* Rating Variance
* Historical Trend
* Last Updated Timestamp

### 7.2 Philosophy

#### 7.2.1 Measuring Possession Ability

Possession is more than simply having the ball. Successful possession enables teams to control the rhythm of the match, reduce defensive exposure and create favourable conditions for future attacking opportunities.

Traditional statistics such as possession percentage often measure volume rather than quality. Two teams may record similar possession percentages while exhibiting very different levels of tactical control and effectiveness.

Accordingly, GLPM models possession as a latent football ability that captures the repeatable processes underlying sustained control of the game.

#### 7.2.2 Hierarchical Possession Architecture

The Possession Rating is estimated using a hierarchical structure comprising Component Ratings, Domain Ratings and a Primary Rating.

```text
Possession Rating 
│
├── Ball Retention Rating
│   ├── Possession Security Rating
│   └── Ball Circulation Rating
│
├── Territorial Control Rating
│   ├── Territorial Dominance Rating
│   └── Space Control Rating
│
└── Possession Control Rating
    ├── Game Control Rating
    └── Possession Tempo Rating

```

This hierarchical structure enables different aspects of possession to be estimated independently before being combined into an overall measure of possession quality.

#### 7.2.3 Ball Retention Rating

The Ball Retention Rating measures a team's ability to maintain possession through secure handling of the ball and effective circulation between players.

It is estimated from:

* Possession Security Rating
* Ball Circulation Rating

Together these Component Ratings evaluate the reliability and continuity of possession.

#### 7.2.4 Territorial Control Rating

The Territorial Control Rating measures how effectively a team controls space and occupies advantageous areas of the pitch while in possession.

It is estimated from:

* Territorial Dominance Rating
* Space Control Rating

These Component Ratings quantify territorial superiority and spatial control.

#### 7.2.5 Possession Control Rating

The Possession Control Rating measures a team's ability to dictate the pace and rhythm of the match while maintaining organised possession.

It is estimated from:

* Game Control Rating
* Possession Tempo Rating

These Component Ratings evaluate how effectively a team manages the flow of the game during possession.

#### 7.2.6 Why a Hierarchical Model?

Representing possession through a hierarchy of latent ratings provides several advantages:

* Separates distinct tactical aspects of possession play.
* Improves model interpretability.
* Reduces redundancy between related variables.
* Produces stable estimates across seasons.
* Supports future model extensions.
* Improves downstream prediction within the Expected Goals Engine.

Rather than treating possession as a single observable statistic, GLPM estimates the underlying abilities that collectively determine a team's control of the ball and the match.

### 7.3 Mathematical Definition

#### 7.3.1 Purpose

The Possession Rating is estimated using a hierarchical latent-variable model.

Historical match observations are transformed into engineered features before estimating Component Ratings, which are aggregated into Domain Ratings and ultimately combined into the overall Possession Rating.

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
Possession Rating

```

#### 7.3.2 Domain Ratings

The Possession Rating is composed of three Domain Ratings.

| Symbol | Domain Rating |
| --- | --- |
| BR | Ball Retention Rating |
| TC | Territorial Control Rating |
| PC | Possession Control Rating |

#### 7.3.3 Component Ratings

Each Domain Rating is estimated from specialised Component Ratings.

| Symbol | Component Rating |
| --- | --- |
| PS | Possession Security Rating |
| BC | Ball Circulation Rating |
| TD | Territorial Dominance Rating |
| SC | Space Control Rating |
| GC | Game Control Rating |
| PT | Possession Tempo Rating |

#### 7.3.4 Hierarchical Estimation

The relationships are defined conceptually as:

* BR = f(PS, BC)
* TC = f(TD, SC)
* PC = f(GC, PT)

The overall Possession Rating is then estimated as:

* PO = f(BR, TC, PC)

where:

* PO = Possession Rating
* BR = Ball Retention Rating
* TC = Territorial Control Rating
* PC = Possession Control Rating

The functions are learned from historical data using statistical and machine learning methods.

#### 7.3.5 Relationship to the Expected Goals Engine

The Possession Rating provides one of the Primary Ratings used within the Expected Goals Engine.

Conceptually,

* xG = g(A, D, GK, BU, PO, PRS, M)

where:

* A = Attack Rating
* D = Defence Rating
* GK = Goalkeeper Rating
* BU = Build-Up Rating
* PO = Possession Rating
* PRS = Pressing Rating
* M = Match Context Variables

The Possession Rating influences a team's ability to sustain attacks, control match dynamics and limit opposition opportunities through effective ball control.

### 7.4 Football Interpretation

#### 7.4.1 Interpreting the Possession Rating

Teams with high Possession Ratings consistently maintain control of the ball while dictating the rhythm and territorial balance of matches.

High ratings reflect sustained control, intelligent circulation and effective management of possession rather than simply recording a high percentage of ball possession.

#### 7.4.2 Relationship Between the Domain Ratings

The three Domain Ratings capture complementary aspects of possession play.

* Ball Retention Rating measures how effectively a team maintains possession.
* Territorial Control Rating measures how effectively a team controls space while in possession.
* Possession Control Rating measures how effectively a team dictates the pace and flow of the game.

Together these ratings provide a comprehensive representation of a team's possession ability.

#### 7.4.3 Role Within GLPM

The Possession Rating represents a team's ability to control matches through sustained, organised possession.

It complements the Build-Up Rating by measuring how effectively possession is maintained after progression has been achieved, while supporting the Attack Rating by creating stable attacking platforms and reducing defensive transitions.

Within GLPM, the Possession Rating serves as one of the Primary Ratings contributing to the Expected Goals Engine and the downstream prediction models.

### 7.5 Data Sources and Raw Inputs

#### 7.5.1 Purpose

The Possession Rating is estimated using historical match observations describing how teams retain possession, control space and dictate the rhythm of play throughout a match.

Rather than relying solely on possession percentage, GLPM combines a broad range of event-level and sequence-level observations that capture the underlying processes responsible for effective possession control.

These observations form the foundation for feature engineering and the estimation of the six Possession Component Ratings.

#### 7.5.2 Data Sources

Historical possession data are collected from structured football datasets, including event-based and tracking data where available.

Typical data sources include:

* Event Data
* Match Statistics
* Player Tracking Data
* Possession Sequences
* Passing Event Logs
* Ball Recovery Events

Each observation is linked to the relevant team, opponent, competition, season and match context.

#### 7.5.3 Possession Data Categories

Raw observations are organised into several categories representing different aspects of possession play.

| Category | Example Variables |
| --- | --- |
| Possession Security | Ball Retention, Turnovers, Miscontrols, Dispossessions |
| Ball Circulation | Pass Completion, Short Passes, Recycling Possession, Switching Play |
| Territorial Dominance | Possession by Third, Final Third Possession, Territorial Occupation |
| Space Control | Width, Depth, Positional Occupancy, Passing Lanes Created |
| Game Control | Possession Share, Possession Duration, Sequence Stability |
| Possession Tempo | Passing Tempo, Ball Speed, Pass Frequency, Sequence Rhythm |

These observations collectively describe a team's ability to control possession and dictate play.

#### 7.5.4 Data Granularity

Possession observations may be recorded at multiple levels.

These include:

* Match Level
* Team Level
* Possession Level
* Sequence Level
* Event Level

Sequence-level and event-level observations provide the greatest precision for estimating possession performance.

### 7.6 Data Preparation and Cleaning

#### 7.6.1 Purpose

Raw possession data frequently contain inconsistencies resulting from differences in event definitions, tracking systems and data providers.

The preparation stage standardises these observations before feature engineering and statistical estimation.

#### 7.6.2 Data Cleaning

The cleaning process includes:

* Removal of duplicate events.
* Validation of possession sequences.
* Standardisation of player and team identifiers.
* Correction of event timestamps.
* Verification of event ordering.
* Removal of invalid observations.

Only validated observations are retained for subsequent modelling.

#### 7.6.3 Missing Data

Missing observations are handled using statistically appropriate imputation techniques.

Possible approaches include:

* Bayesian Imputation
* Historical Team Priors
* League-Level Priors
* Model-Based Imputation

The selected method depends on the quantity and reliability of available observations.

#### 7.6.4 Normalisation

To improve comparability across competitions and tactical systems, variables are normalised where appropriate.

Typical transformations include:

* Per 90 Minutes
* Per Possession
* Per Passing Sequence
* Per Passing Attempt
* Per Ball Recovery

These transformations reduce systematic bias arising from differences in playing style and possession volume.

#### 7.6.5 Outlier Detection

Extreme observations are evaluated using robust statistical procedures.

Potential outliers include:

* Exceptionally long possession sequences.
* Very low possession matches.
* Unbalanced scorelines.
* Severe weather conditions.
* Data collection anomalies.

Where appropriate, observations may be winsorised or assigned reduced statistical weight during estimation.

### 7.7 Feature Engineering

#### 7.7.1 Purpose

Feature engineering transforms raw possession observations into statistically informative variables that better represent the underlying abilities being modelled.

These engineered features provide the inputs for estimating the six Component Ratings.

#### 7.7.2 Possession Security Features

Representative features include:

* Possession Retention Rate
* Turnovers per Possession
* Dispossessions per 90
* Miscontrol Rate
* Ball Security Index
* Possession Recovery Rate

These variables estimate a team's ability to retain possession and minimise unnecessary losses of the ball.

#### 7.7.3 Ball Circulation Features

Representative features include:

* Pass Completion Percentage
* Short Pass Success Rate
* Average Pass Chain Length
* Possession Recycling Rate
* Switching Success Rate
* Ball Circulation Index

These variables measure the efficiency and reliability of circulating possession.

#### 7.7.4 Territorial Dominance Features

Representative features include:

* Final Third Possession Share
* Opposition Half Possession Percentage
* Territory Occupation Index
* Average Possession Position
* Territorial Control Percentage
* Sustained Territorial Pressure

These variables estimate how effectively a team controls advanced areas of the pitch.

#### 7.7.5 Space Control Features

Representative features include:

* Effective Team Width
* Effective Team Depth
* Passing Lane Availability
* Positional Occupancy Index
* Spatial Control Score
* Formation Compactness in Possession

These variables measure how effectively a team creates and occupies space while maintaining possession.

#### 7.7.6 Game Control Features

Representative features include:

* Average Possession Duration
* Long Possession Sequence Rate
* Possession Stability Index
* Opposition Possession Suppression
* Match Control Index
* Sustained Possession Percentage

These variables evaluate a team's ability to dictate the flow and control of a match through possession.

#### 7.7.7 Possession Tempo Features

Representative features include:

* Pass Frequency
* Average Pass Interval
* Ball Circulation Speed
* Tempo Consistency
* Possession Rhythm Index
* Tempo Adaptability

These variables measure the speed and rhythm with which possession is managed.

#### 7.7.8 Feature Scaling

Following feature engineering, variables are transformed using consistent statistical scaling procedures.

Typical methods include:

* Standardisation
* Robust Scaling
* Logarithmic Transformation
* Quantile Normalisation

The selected transformation depends on the statistical properties of each feature.

### 7.8 Context and Opposition Adjustment

#### 7.8.1 Purpose

Observed possession statistics are influenced by opposition quality, tactical philosophy and match context.

To estimate underlying possession ability rather than observed outcomes, GLPM adjusts engineered features for contextual influences before estimating the Component Ratings.

#### 7.8.2 Opposition Adjustment

Possession observations are adjusted according to the quality of the opposition.

Representative adjustments include:

* Opposition Pressing Rating
* Opposition Defence Rating
* Opposition Possession Rating
* Opposition Tactical Style

These adjustments ensure that maintaining possession against stronger opponents is appropriately recognised.

#### 7.8.3 Tactical Adjustment

Additional adjustments account for differences in team playing style.

Representative variables include:

* Formation
* Possession Philosophy
* Build-Up Style
* Average Team Width
* Defensive Line Height
* Tactical Flexibility

These adjustments reduce stylistic bias between teams employing different approaches to possession.

#### 7.8.4 Match Context

Additional contextual adjustments include:

* Home Advantage
* Match State
* Rest Days
* Fixture Congestion
* Competition Type
* Playing Surface
* Weather Conditions

These factors account for external influences on possession performance.

#### 7.8.5 Adjusted Possession Features

Following contextual adjustment, the resulting engineered features provide unbiased estimates of a team's underlying possession abilities.

These adjusted features form the inputs to the six Component Rating models described in Part III.

**Chapter Pipeline Summary**

```text
Historical Match Data
│ 
▼
Raw Possession Observations
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
Adjusted Possession Features
│
▼
Component Rating Models
│
▼
Ball Retention Rating
Territorial Control Rating
Possession Control Rating
│
▼
Possession Rating

```

### 7.9 Possession Security Rating

#### 7.9.1 Purpose

The Possession Security Rating measures a team's underlying ability to retain possession by minimising unnecessary turnovers, maintaining technical security and protecting the ball during all phases of possession.

The Possession Security Rating forms one of the two Component Ratings used to estimate the Ball Retention Rating.

#### 7.9.2 Football Interpretation

Teams with high Possession Security Ratings consistently:

* Retain possession under pressure.
* Minimise unforced turnovers.
* Protect the ball effectively.
* Demonstrate sound technical execution.
* Sustain possession over extended periods.

The rating reflects a team's reliability in maintaining possession.

#### 7.9.3 Raw Inputs

Representative variables include:

* Turnovers
* Dispossessions
* Miscontrols
* Ball Recoveries
* Successful Ball Retentions
* Possession Losses

#### 7.9.4 Engineered Features

Representative features include:

* Possession Retention Rate
* Turnovers per Possession
* Ball Security Index
* Miscontrol Rate
* Recovery Success Rate
* Secure Possession Percentage

#### 7.9.5 Statistical Estimation

Features are adjusted for:

* Opposition Pressing Rating
* Match Context
* Tactical Style
* Competition Strength
* Home Advantage

The adjusted observations estimate the latent Possession Security Rating.

#### 7.9.6 Machine Learning Model

Candidate algorithms include:

* Gradient Boosted Trees
* Bayesian Hierarchical Models
* Random Forests
* Elastic Net Regression

The final model is selected according to predictive accuracy, calibration and long-term stability.

#### 7.9.7 Outputs

The model stores:

* Possession Security Rating
* Confidence Score
* Rating Variance
* Historical Trend
* Last Updated

#### 7.9.8 Relationship to Ball Retention Rating

The Possession Security Rating combines with the Ball Circulation Rating to estimate the Ball Retention Rating.

### 7.10 Ball Circulation Rating

#### 7.10.1 Purpose

The Ball Circulation Rating measures the efficiency, accuracy and continuity of passing used to maintain possession and support team organisation.

The Ball Circulation Rating forms one of the two Component Ratings contributing to the Ball Retention Rating.

#### 7.10.2 Football Interpretation

Teams with high Ball Circulation Ratings consistently:

* Move the ball efficiently.
* Maintain passing accuracy.
* Recycle possession intelligently.
* Switch play when advantageous.
* Preserve attacking structure while circulating possession.

The rating reflects the effectiveness of ball movement during sustained possession.

#### 7.10.3 Raw Inputs

Representative variables include:

* Completed Passes
* Short Passes
* Medium Passes
* Switches of Play
* Passing Sequences
* Possession Recycling Events

#### 7.10.4 Engineered Features

Representative features include:

* Pass Completion Percentage
* Average Pass Chain Length
* Switching Success Rate
* Ball Circulation Index
* Recycling Efficiency
* Passing Continuity Score

#### 7.10.5 Statistical Estimation

Features are adjusted for:

* Opposition Pressing Rating
* Tactical Style
* Match Context
* Competition Strength

The adjusted observations estimate the latent Ball Circulation Rating.

#### 7.10.6 Machine Learning Model

Candidate algorithms include:

* Gradient Boosted Trees
* Bayesian Hierarchical Models
* Random Forests

#### 7.10.7 Outputs

The model stores:

* Ball Circulation Rating
* Confidence Score
* Rating Variance
* Historical Trend
* Last Updated

#### 7.10.8 Relationship to Ball Retention Rating

The Ball Circulation Rating complements the Possession Security Rating in estimating the Ball Retention Rating.

### 7.11 Territorial Dominance Rating

#### 7.11.1 Purpose

The Territorial Dominance Rating measures a team's ability to establish and maintain possession in advanced areas of the pitch, thereby increasing territorial advantage and limiting opposition influence.

The Territorial Dominance Rating forms one of the two Component Ratings contributing to the Territorial Control Rating.

#### 7.11.2 Football Interpretation

Teams with high Territorial Dominance Ratings consistently:

* Sustain possession in the opposition half.
* Control advanced field positions.
* Push opponents into defensive areas.
* Maintain territorial superiority.
* Increase attacking pressure through field position.

The rating reflects a team's ability to control where the game is played.

#### 7.11.3 Raw Inputs

Representative variables include:

* Final Third Possession
* Opposition Half Possession
* Territory Gained
* Attacking Third Entries
* Average Possession Position
* Field Tilt

#### 7.11.4 Engineered Features

Representative features include:

* Territorial Control Percentage
* Territory Occupation Index
* Final Third Possession Share
* Average Possession Position
* Sustained Territorial Pressure
* Field Position Index

#### 7.11.5 Statistical Estimation

Features are adjusted for:

* Opposition Defensive Rating
* Tactical Style
* Match Context
* Competition Strength

The adjusted observations estimate the latent Territorial Dominance Rating.

#### 7.11.6 Machine Learning Model

Candidate algorithms include:

* Gradient Boosted Trees
* Bayesian Hierarchical Models
* Random Forests

#### 7.11.7 Outputs

The model stores:

* Territorial Dominance Rating
* Confidence Score
* Rating Variance
* Historical Trend
* Last Updated

#### 7.11.8 Relationship to Territorial Control Rating

The Territorial Dominance Rating combines with the Space Control Rating to estimate the Territorial Control Rating.

### 7.12 Space Control Rating

#### 7.12.1 Purpose

The Space Control Rating measures a team's ability to create, occupy and exploit space while maintaining organised possession.

The Space Control Rating forms one of the two Component Ratings contributing to the Territorial Control Rating.

#### 7.12.2 Football Interpretation

Teams with high Space Control Ratings consistently:

* Maintain effective team spacing.
* Create passing lanes.
* Occupy advantageous positions.
* Stretch defensive structures.
* Improve passing options through movement.

The rating reflects a team's spatial organisation during possession.

#### 7.12.3 Raw Inputs

Representative variables include:

* Team Width
* Team Depth
* Positional Occupancy
* Passing Lane Availability
* Player Spacing
* Formation Structure

#### 7.12.4 Engineered Features

Representative features include:

* Effective Team Width
* Effective Team Depth
* Positional Occupancy Index
* Spatial Control Score
* Passing Lane Index
* Formation Stability

#### 7.12.5 Statistical Estimation

Features are adjusted for:

* Tactical Style
* Opposition Pressing Rating
* Match Context
* Competition Strength

The adjusted observations estimate the latent Space Control Rating.

#### 7.12.6 Machine Learning Model

Candidate algorithms include:

* Gradient Boosted Trees
* Bayesian Hierarchical Models
* Random Forests

#### 7.12.7 Outputs

The model stores:

* Space Control Rating
* Confidence Score
* Rating Variance
* Historical Trend
* Last Updated

#### 7.12.8 Relationship to Territorial Control Rating

The Space Control Rating complements the Territorial Dominance Rating in estimating the Territorial Control Rating.

### 7.13 Game Control Rating

#### 7.13.1 Purpose

The Game Control Rating measures a team's ability to dictate the overall flow of a match through sustained possession, territorial management and strategic control.

The Game Control Rating forms one of the two Component Ratings contributing to the Possession Control Rating.

#### 7.13.2 Football Interpretation

Teams with high Game Control Ratings consistently:

* Dictate the pace of matches.
* Limit opposition possession.
* Maintain long periods of controlled possession.
* Manage different match states effectively.
* Reduce game volatility.

The rating reflects a team's overall command of the match while in possession.

#### 7.13.3 Raw Inputs

Representative variables include:

* Possession Percentage
* Possession Duration
* Long Possession Sequences
* Opposition Possession Share
* Match State
* Ball Recovery Time

#### 7.13.4 Engineered Features

Representative features include:

* Match Control Index
* Sustained Possession Percentage
* Possession Stability Index
* Opposition Possession Suppression
* Controlled Sequence Rate
* Game Management Score

#### 7.13.5 Statistical Estimation

Features are adjusted for:

* Opposition Quality
* Tactical Style
* Match Context
* Competition Strength

The adjusted observations estimate the latent Game Control Rating.

#### 7.13.6 Machine Learning Model

Candidate algorithms include:

* Gradient Boosted Trees
* Bayesian Hierarchical Models
* Random Forests

#### 7.13.7 Outputs

The model stores:

* Game Control Rating
* Confidence Score
* Rating Variance
* Historical Trend
* Last Updated

#### 7.13.8 Relationship to Possession Control Rating

The Game Control Rating combines with the Possession Tempo Rating to estimate the Possession Control Rating.

### 7.14 Possession Tempo Rating

#### 7.14.1 Purpose

The Possession Tempo Rating measures how effectively a team controls the speed and rhythm of possession throughout a match.

The Possession Tempo Rating forms one of the two Component Ratings contributing to the Possession Control Rating.

#### 7.14.2 Football Interpretation

Teams with high Possession Tempo Ratings consistently:

* Vary the speed of possession appropriately.
* Accelerate attacks when opportunities arise.
* Slow the game when tactical control is required.
* Maintain a consistent possession rhythm.
* Adapt tempo to match situations.

The rating reflects intelligent tempo management rather than simply playing quickly.

#### 7.14.3 Raw Inputs

Representative variables include:

* Pass Frequency
* Average Pass Interval
* Possession Speed
* Sequence Duration
* Tempo Changes
* Ball Circulation Speed

#### 7.14.4 Engineered Features

Representative features include:

* Possession Rhythm Index
* Tempo Consistency
* Tempo Adaptability
* Average Pass Interval
* Sequence Efficiency
* Controlled Tempo Score

#### 7.14.5 Statistical Estimation

Features are adjusted for:

* Tactical Style
* Match Context
* Opposition Quality
* Competition Strength

The adjusted observations estimate the latent Possession Tempo Rating.

#### 7.14.6 Machine Learning Model

Candidate algorithms include:

* Gradient Boosted Trees
* Bayesian Hierarchical Models
* Random Forests

#### 7.14.7 Outputs

The model stores:

* Possession Tempo Rating
* Confidence Score
* Rating Variance
* Historical Trend
* Last Updated

#### 7.14.8 Relationship to Possession Control Rating

The Possession Tempo Rating complements the Game Control Rating in estimating the Possession Control Rating.

### 7.15 Rating Calibration and Interpretation

#### 7.15.1 Purpose

All Possession Ratings produced within the Graham League Prediction Model (GLPM) are calibrated using the universal GLPM Rating Scale introduced in Section 3.15. This common calibration framework ensures that Component Ratings, Domain Ratings and Primary Ratings are directly comparable across teams, competitions and seasons.

Rather than defining a possession-specific calibration methodology, GLPM applies a unified statistical framework to every latent rating estimated within the model.

#### 7.15.2 GLPM Rating Scale

The Possession Rating, together with all associated Component Ratings and Domain Ratings, uses the universal GLPM Rating Scale defined in Section 3.15.

This common scale enables consistent interpretation across every rating within GLPM while supporting direct comparison between different aspects of team performance.

#### 7.15.3 Interpretation

Higher Possession Ratings indicate stronger underlying possession ability.

For example:

* A high Ball Retention Rating indicates a team consistently maintains possession through technical security and effective ball circulation.
* A high Territorial Control Rating indicates a team effectively controls field position and spatial occupation while in possession.
* A high Possession Control Rating indicates a team successfully dictates the tempo and rhythm of matches.
* A high Possession Rating represents elite overall control of possession across all phases of play.

Detailed rating classifications and performance bands are defined in Section 3.15.

#### 7.15.4 Calibration Consistency

Using a common calibration framework provides several advantages:

* Consistent interpretation across all GLPM ratings.
* Direct comparison between possession and other Primary Ratings.
* Stable rating distributions across seasons.
* Simplified communication of model outputs.
* Improved long-term maintainability.

## Part V – Domain Ratings

### 7.16 Ball Retention Rating

#### 7.16.1 Purpose

The Ball Retention Rating measures a team's ability to consistently maintain possession through technical security and efficient ball circulation. It captures how effectively a team protects the ball while sustaining possession over prolonged periods.

The Ball Retention Rating represents the foundation of effective possession play, providing the stability required to control matches and support attacking development.

#### 7.16.2 Component Ratings

The Ball Retention Rating is estimated from:

* Possession Security Rating
* Ball Circulation Rating

Together these Component Ratings evaluate both the protection of possession and the quality of ball movement required to sustain it.

#### 7.16.3 Football Interpretation

Teams with high Ball Retention Ratings consistently:

* Protect possession under pressure.
* Minimise unnecessary turnovers.
* Circulate the ball efficiently.
* Maintain long possession sequences.
* Sustain organised possession across all areas of the pitch.

The Ball Retention Rating reflects the consistency and reliability of possession maintenance.

#### 7.16.4 Mathematical Definition

Conceptually,

* BR = f(PS, BC)

where:

* BR = Ball Retention Rating
* PS = Possession Security Rating
* BC = Ball Circulation Rating

The relationship is learned from historical data using statistical and machine learning methods.

#### 7.16.5 Outputs

The Ball Retention Model produces:

* Ball Retention Rating
* Confidence Score
* Rating Variance
* Historical Trend
* Last Updated

#### 7.16.6 Relationship to Possession Rating

The Ball Retention Rating provides one of the three Domain Ratings contributing to the overall Possession Rating.

### 7.17 Territorial Control Rating

#### 7.17.1 Purpose

The Territorial Control Rating measures a team's ability to control advantageous areas of the pitch through effective positioning, spatial occupation and sustained territorial dominance while in possession.

This Domain Rating evaluates how effectively possession is translated into territorial superiority.

#### 7.17.2 Component Ratings

The Territorial Control Rating is estimated from:

* Territorial Dominance Rating
* Space Control Rating

Together these Component Ratings measure how effectively teams control space and field position during possession.

#### 7.17.3 Football Interpretation

Teams with high Territorial Control Ratings consistently:

* Control possession in advanced areas.
* Occupy space effectively.
* Push opponents into defensive positions.
* Maintain territorial superiority.
* Increase attacking pressure through field position.

The Territorial Control Rating reflects a team's ability to dictate where the game is played.

#### 7.17.4 Mathematical Definition

Conceptually,

* TC = f(TD, SC)

where:

* TC = Territorial Control Rating
* TD = Territorial Dominance Rating
* SC = Space Control Rating

The weighting of each Component Rating is determined through statistical learning and optimisation procedures.

#### 7.17.5 Outputs

The Territorial Control Model produces:

* Territorial Control Rating
* Confidence Score
* Rating Variance
* Historical Trend
* Last Updated

#### 7.17.6 Relationship to Possession Rating

The Territorial Control Rating provides the second Domain Rating contributing to the overall Possession Rating.

### 7.18 Possession Control Rating

#### 7.18.1 Purpose

The Possession Control Rating measures a team's ability to dictate the pace, rhythm and overall flow of a match through organised possession.

This Domain Rating captures the strategic use of possession to influence match dynamics rather than simply maintain control of the ball.

#### 7.18.2 Component Ratings

The Possession Control Rating is estimated from:

* Game Control Rating
* Possession Tempo Rating

Together these Component Ratings evaluate a team's ability to manage the rhythm of play while maintaining sustained possession.

#### 7.18.3 Football Interpretation

Teams with high Possession Control Ratings consistently:

* Dictate the tempo of matches.
* Control the rhythm of possession.
* Manage different match situations effectively.
* Reduce game volatility.
* Maintain tactical control through organised possession.

The Possession Control Rating reflects a team's ability to influence the overall flow of a match.

#### 7.18.4 Mathematical Definition

Conceptually,

* PC = f(GC, PT)

where:

* PC = Possession Control Rating
* GC = Game Control Rating
* PT = Possession Tempo Rating

The weighting of each Component Rating is determined through statistical learning and optimisation procedures.

#### 7.18.5 Outputs

The Possession Control Model produces:

* Possession Control Rating
* Confidence Score
* Rating Variance
* Historical Trend
* Last Updated

#### 7.18.6 Relationship to Possession Rating

The Possession Control Rating provides the third Domain Rating contributing to the overall Possession Rating.

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
Possession Security
Ball Circulation
Territorial Dominance
Space Control
Game Control
Possession Tempo 
│
▼
──────────────────────────────────
Domain Ratings
──────────────────────────────────
Ball Retention Rating
Territorial Control Rating
Possession Control Rating
│
▼
Possession Rating

```

### 7.19 Possession Rating Estimation

#### 7.19.1 Purpose

The Possession Rating represents the highest-level latent measure of a team's overall ability to control possession within GLPM. It combines the Ball Retention Rating, Territorial Control Rating and Possession Control Rating into a single estimate of long-term possession quality.

Unlike traditional measures based solely on possession percentage, the Possession Rating integrates multiple independent dimensions of possession while accounting for tactical context and statistical uncertainty.

#### 7.19.2 Inputs

The Possession Rating is estimated from:

* Ball Retention Rating
* Territorial Control Rating
* Possession Control Rating

Each Domain Rating captures a distinct aspect of possession performance.

#### 7.19.3 Mathematical Definition

The latent Possession Rating for team i is defined as:

* PO_i = f(BR_i, TC_i, PC_i)

where:

* PO_i = Possession Rating
* BR_i = Ball Retention Rating
* TC_i = Territorial Control Rating
* PC_i = Possession Control Rating

The function f(·) is learned from historical data using statistical and machine learning techniques.

#### 7.19.4 Estimation Process

The Possession Rating is estimated through four stages:

1. Estimate the six Component Ratings.
2. Aggregate the Component Ratings into the three Domain Ratings.
3. Learn the relationship between the Domain Ratings and future possession performance.
4. Produce the calibrated Possession Rating.

Each stage is independently validated before contributing to the next level of the hierarchy.

#### 7.19.5 Model Outputs

The Possession Rating Model produces:

* Possession Rating
* Rating Confidence
* Rating Variance
* Historical Trend
* Last Updated
* Prediction Uncertainty

These outputs provide both an estimate of possession quality and measures of estimation reliability.

#### 7.19.6 Relationship to the Expected Goals Engine

The Possession Rating acts as one of the Primary Ratings within the Expected Goals Engine, where it interacts with:

* Attack Rating
* Defence Rating
* Goalkeeper Rating
* Build-Up Rating
* Pressing Rating
* Match Context Variables
* Player Availability

Together these variables estimate fixture-specific scoring probabilities while accounting for a team's ability to control the ball and the flow of play.

### 7.20 Relationship to the GLPM Framework

#### 7.20.1 Role Within the Rating Architecture

The Possession Rating is one of the Primary Ratings within GLPM.

It complements the Build-Up Rating by measuring how effectively teams maintain and exploit possession after progressing the ball, while supporting the Attack Rating by creating stable attacking platforms and reducing defensive transitions.

#### 7.20.2 Integration with Other Primary Ratings

The Possession Rating interacts with several other Primary Ratings, including:

* Attack Rating
* Defence Rating
* Goalkeeper Rating
* Build-Up Rating
* Pressing Rating

Each rating captures a distinct dimension of football performance while remaining as statistically independent as possible.

#### 7.20.3 Role in Match Prediction

Within the Expected Goals Engine, the Possession Rating influences:

* Sustained attacking pressure.
* Expected goal creation through controlled possession.
* Territorial dominance.
* Match tempo.
* Scoreline distributions.
* Match outcome probabilities.

The Possession Rating therefore contributes directly to every downstream prediction generated by GLPM.

### 7.21 Chapter Summary

This chapter has defined the methodology used to estimate the Possession Rating within the Graham League Prediction Model.

Beginning with historical match data, raw possession observations were transformed into engineered features before being used to estimate six specialised Component Ratings:

* Possession Security Rating
* Ball Circulation Rating
* Territorial Dominance Rating
* Space Control Rating
* Game Control Rating
* Possession Tempo Rating

These Component Ratings were then aggregated into three Domain Ratings:

* Ball Retention Rating
* Territorial Control Rating
* Possession Control Rating

Finally, the Domain Ratings were combined to estimate the latent Possession Rating, which serves as one of the Primary Ratings within GLPM and contributes directly to the Expected Goals Engine.

By modelling possession as a hierarchy of latent abilities rather than relying solely on possession percentage, GLPM provides a robust, interpretable and extensible representation of a team's ability to control matches through sustained possession.

**Chapter 7 Hierarchy Summary**

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
Possession Security
Ball Circulation
Territorial Dominance
Space Control
Game Control
Possession Tempo
│
▼
────────────────────────────────────
Domain Ratings
────────────────────────────────────
Ball Retention Rating
Territorial Control Rating
Possession Control Rating
▼
Possession Rating
▼
Expected Goals Engine 

```

