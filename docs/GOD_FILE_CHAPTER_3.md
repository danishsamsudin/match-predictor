## Chapter 3 - Attack Rating



### Part I - Foundations



#### Chapter Overview



**Objective**


To estimate a team's underlying attacking ability by modelling the repeatable football processes responsible for creating goal-scoring opportunities against league-average opposition.

Unlike traditional football metrics that rely heavily on goals scored, the Attack Rating seeks to quantify sustainable attacking performance by separating long-term team quality from short-term randomness.

The Attack Rating forms one of the Primary Ratings within the Graham League Prediction Model (GLPM) and serves as a core input to the Expected Goals Engine.

**Inputs**


The Attack Rating is estimated using:

* Historical Match Data


* Engineered Features


* Team Context


* Opponent Adjustments


* Player Availability


* Component Ratings



**Outputs**


The Attack Rating Engine produces:

* Component Ratings


* Domain Ratings


* Attack Rating


* Rating Confidence


* Rating Trend


* Historical Rating Archive



**Dependencies**


This chapter builds upon:

* Chapter 1 - Model Philosophy


* Chapter 2 - Data Architecture



**Used By**


The Attack Rating is used by:

* Expected Goals Engine


* Tactical Interaction Engine


* Prediction Engine


* Betting & Value Engine



---

#### 3.1 Purpose



The purpose of the Attack Rating is to estimate a team's intrinsic ability to create scoring opportunities.

Within GLPM, attacking strength is not defined by the number of goals scored. Goals represent the final outcome of a complex sequence of football events and are influenced by numerous factors that may not accurately reflect the underlying quality of a team's attacking process.
Examples include:

* Exceptional finishing


* Goalkeeper performance


* Deflections


* Refereeing decisions


* Random variance


* Small sample effects



As a result, goals alone provide an incomplete measure of attacking ability.

Instead, GLPM evaluates the processes that consistently lead to goal-scoring opportunities.
These processes are considerably more stable over time and therefore provide a stronger foundation for predictive modelling.

The Attack Rating is therefore defined as a latent footballing ability rather than a directly observable statistic.
Its purpose is to estimate how effectively a team would be expected to generate scoring opportunities against league-average opposition under neutral conditions.

The Attack Rating serves five primary objectives:

1. Quantify long-term attacking quality.


2. Reduce the influence of short-term randomness.


3. Provide stable inputs for expected goals modelling.


4. Support tactical matchup analysis.


5. Improve long-term predictive accuracy.



By focusing on sustainable attacking processes rather than isolated match outcomes, GLPM produces ratings that are both more interpretable and more predictive.

---

#### 3.2 Philosophy



The central philosophy behind the Attack Rating is that football performance should be measured through process rather than outcome.

A team may score four goals despite creating very few genuine scoring opportunities, while another team may fail to score despite producing numerous high-quality chances.
Although these matches produce different scorelines, they may reveal the opposite about each team's underlying attacking quality.

Consequently, GLPM does not attempt to predict future performance by learning directly from goals scored. Instead, it seeks to model the repeatable behaviours that consistently generate attacking success.

These behaviours are represented through a hierarchy of Component Ratings, each measuring a distinct aspect of attacking performance.

The Attack Rating is therefore constructed from multiple underlying football processes, including three higher-level attacking domains:

**Creation**

* Chance Volume


* Chance Quality



**Progression**

* Ball Progression


* Territorial Control



**Situational**

* Transition Threat


* Set Piece Threat



Each component captures a different dimension of attacking play.
Rather than competing with one another, these components complement one another to provide a comprehensive representation of a team's attacking identity.

This modular approach provides several advantages.
First, it improves interpretability by allowing analysts to identify which aspects of attacking play contribute most strongly to the overall rating.
Second, it improves robustness by reducing the influence of noisy individual statistics.
Third, it allows future improvements to individual components without requiring the entire Attack Rating model to be redesigned.
Finally, it provides the Tactical Interaction Engine with meaningful football characteristics that can be compared against an opponent's defensive profile.

The Attack Rating should therefore be viewed as a statistical summary of multiple interacting football processes rather than a single independent measurement.

**Attack Rating Pipeline Structure:**

```text
Raw Match Data
      ↓
Cleaning
      ↓
Feature Engineering
      ↓
Opponent Adjustment
      ↓
Creation Components
  * Chance Volume
  * Chance Quality
      ↓
  Creation Rating
      ↓
Progression Components
  * Ball Progression
  * Territorial Control
      ↓
  Progression Score
      ↓
Situational Components
  * Transition Threat
  * Set Piece Threat
      ↓
  Situational Score
      ↓
Attack Rating

```

*(Based on the hierarchical diagrams provided in the source)*

---

#### 3.3 Mathematical Definition



Let $A_{i}$ represent the Attack Rating of team i.
The Attack Rating is defined as the latent attacking ability of a team after accounting for opponent strength, contextual effects and observational noise.

Conceptually,

$$A_{i}=f(C,P,S)$$


Where:

* $C=$ Creation Rating


* $P=$ Progression Score


* $S=$ Situational Score



Then define:

* Creation: $C=f(CV,CQ)$

* Progression: $P=f(BP,TC)$

* Situational: $S=f(TT,SP)$


where:

| Symbol | Domain Rating | Component Ratings |
| --- | --- | --- |
| **C** | Creation Rating | Chance Volume (CV), Chance Quality (CQ) |
| **P** | Progression Rating | Ball Progression (BP), Territorial Control (TC) |
| **S** | Situational Rating | Transition Threat (TT), Set Piece Threat (SP) |
| <br><br> |  |  |

| Symbol | Component |
| --- | --- |
| **CV** | Chance Volume |
| **CQ** | Chance Quality |
| **BP** | Ball Progression |
| **TC** | Territorial Control |
| **TT** | Transition Threat |
| **SP** | Set Piece Threat |
| <br><br> |  |

Each component is itself estimated from engineered features extracted from historical match data.
The Attack Rating therefore represents a second-level latent variable built upon independently estimated component ratings.

During model training, the relationship between these components and the final Attack Rating is learned statistically rather than specified manually.
This allows GLPM to discover the relative importance of each attacking process directly from historical evidence.

The Attack Rating does not estimate expected goals directly.
Instead, it provides one of the principal inputs to the Expected Goals Engine, where it is combined with:

* Opposition Defence Rating


* Tactical Interaction Adjustments


* Context Variables


* Home Advantage


* Player Availability
to estimate fixture-specific expected goals.



Accordingly,

$xG = g(P)$


Home

where

* $A_{H}=$ Home Attack Rating


* $D_{A}=$ Away Defence Rating


* $T=$ Tactical Interaction Effects


* $C=$ Context Variables


* $P=$ Player Effects



The Expected Goals Engine is described in Chapter 10.

---

#### 3.4 Football Interpretation



From a football perspective, the Attack Rating answers a simple but important question:
*"How good is this team at creating scoring opportunities, regardless of whether those chances happened to become goals?"*

This distinction separates sustainable attacking quality from short-term match outcomes.

For example, two teams may both average 1.8 expected goals per match while achieving that output through entirely different methods.
One team may dominate possession, patiently progressing the ball into advanced areas before creating high-quality chances through structured build-up play.
Another team may create the same expected goals almost exclusively through rapid transitions following defensive recoveries.

Although their attacking outputs appear similar, their attacking identities are fundamentally different.

By estimating individual Component Ratings before constructing the overall Attack Rating, GLPM preserves these differences rather than averaging them away.
This enables the model to recognise *how* a team attacks, not simply *how much* it attacks.

Consequently, the Attack Rating should not be interpreted as a measure of goals scored or attacking style in isolation.
Instead, it represents the team's underlying ability to generate dangerous attacking situations across a wide range of opponents and match conditions.

This interpretation is particularly important for later stages of GLPM.
Because the Tactical Interaction Engine operates on Component Ratings and Interaction Profiles rather than goals alone, the model can explain why two teams with similar Attack Ratings may produce very different expected goals against the same opponent.

The Attack Rating therefore acts as the bridge between observable football actions and probabilistic match prediction. It transforms thousands of individual match events into a single interpretable measure of attacking quality while preserving the underlying information required for tactical analysis and expected goals modelling.

---

### Part II - Data Pipeline



#### 3.5 Data Sources & Raw Inputs



**Purpose**


The objective of this stage is to collect the raw observations that describe a team's attacking performance.
These observations form the foundation of the Attack Rating estimation process. At this stage, no modelling, weighting or adjustments are applied. Every variable represents an observable football event recorded during a match.

The quality of the Attack Rating is fundamentally constrained by the quality of the underlying data. Consequently, GLPM is designed to prioritise objective event data that is consistently available across major football competitions.

**Design Principles**


The raw data used by GLPM follows five principles:

* **Objectivity** - Only measurable football events are included.


* **Repeatability** - Metrics should be reproducible across competitions and seasons.


* **Predictive Value** - Variables should explain future attacking performance rather than simply describe past results.


* **Availability** - Data should be obtainable from established event-data providers.


* **Extensibility** - Additional variables can be incorporated without redesigning the model.



**Primary Data Categories**

1. **Chance Creation**


Measures the frequency with which a team creates shooting opportunities.
Typical variables include:



* Shots


* Shots on Target


* Non-Penalty xG


* Open Play xG


* Big Chances Created


* Box Entries


* Touches in Opposition Box



2. **Ball Progression**


Measures how effectively possession is advanced into dangerous areas.
Variables include:



* Progressive Passes


* Progressive Carries


* Final Third Entries


* Passes into the Penalty Area


* Deep Completions



3. **Territory**


Measures territorial dominance.
Variables include:



* Possession %


* Field Tilt


* Final Third Possession


* Attacking Third Touches


* Territory %



4. **Transition**


Measures attacking output immediately following possession regains.
Variables include:



* Fast Breaks


* Transition Shots


* Transition xG


* Direct Attacks


* Average Transition Speed



5. **Set Pieces**


Measures attacking production from dead-ball situations.
Variables include:



* Set Piece xG


* Corner xG


* Free Kick xG


* Corner Deliveries


* Set Piece Shots



**Match Context**


Although context is not used directly to estimate attacking ability, it is recorded for later adjustment.
Examples include:

* Home or Away


* Days Rest


* Weather


* Travel Distance


* Match Congestion


* Competition


* Red Cards



**Relationship to Component Ratings**


Each category contributes to one or more Attack Components.

| Data Category | Primary Component |
| --- | --- |
| Chance Creation | Chance Volume |
| Shot Quality | Chance Quality |
| Ball Progression | Ball Progression |
| Territory | Territorial Control |
| Transition | Transition Threat |
| Set Pieces | Set Piece Threat |
| <br><br> |  |

No Attack Rating is calculated at this stage. The objective is simply to construct a complete observational record describing attacking performance.

---

#### 3.6 Data Preparation & Cleaning



**Purpose**


Raw football data inevitably contains inconsistencies, missing values and contextual distortions that must be addressed before modelling.
The purpose of this stage is to transform raw observations into a consistent, reliable dataset suitable for statistical learning.

**Standardisation**


Variables are converted into common units.
Examples include:

* Per 90 minutes


* Per Possession


* Per 100 Passes


* Per Attacking Sequence



This ensures fair comparison between teams with different tactical styles.

**Missing Data**


Missing values may arise due to:

* Incomplete event collection


* Newly promoted clubs


* Abandoned matches


* Small sample sizes



GLPM handles missing observations through:

* Statistical imputation


* League averages


* Rolling historical estimates


* Confidence penalties



**Outlier Detection**


Exceptional matches can distort long-term ratings.
Examples:

* Early red cards


* Extreme weather


* Matches decided by multiple penalties



Outliers are identified using robust statistical methods before determining whether they should be down-weighted rather than removed entirely.

**Time Decay**


Recent performances provide stronger evidence of current team ability.
Each historical observation therefore receives a weight based upon recency.
Older matches contribute progressively less information than recent matches.
The exact weighting function is described in Chapter 13.

**Quality Assurance**


Before feature engineering begins, the cleaned dataset must satisfy:

* No duplicate matches


* Consistent team identifiers


* Consistent competition identifiers


* Complete timestamps


* Standardised variable definitions



Only validated observations proceed to feature engineering.

---

#### 3.7 Feature Engineering



**Purpose**


Raw football statistics rarely represent the underlying processes that GLPM aims to model.
Feature engineering transforms observable match events into higher-level variables that better describe attacking performance.

These engineered features are first used to estimate Component Ratings. The Component Ratings are then combined into Domain Ratings, which collectively determine the overall Attack Rating.

**Why Feature Engineering?**


Consider two teams:

| Team A | Team B |
| --- | --- |
| 18 shots | 9 shots |
| 1.2 xG | 1.8 xG |
| <br><br> |  |

Raw shot totals suggest Team A attacks better.
However, Average xG per shot tells a different story.
Feature engineering extracts this more meaningful information.

**Examples of Engineered Features**

* **Chance Volume**

* Shots per 90


* Box Entries per 90


* Big Chances per Match


* Shot Frequency




* **Chance Quality**

* xG per Shot


* Big Chance Percentage


* Central Shot Percentage


* Average Shot Distance




* **Ball Progression**

* Progressive Pass Rate


* Progressive Carry Rate


* Penalty Area Entry Rate


* Final Third Progression




* **Territorial Control**

* Field Tilt


* Territory %


* Final Third Possession


* Sustained Pressure %




* **Transition Threat**

* Transition xG per Recovery


* Fast Break Rate


* Direct Attack Frequency




* **Set Piece Threat**

* Set Piece xG per Match


* Corner Conversion Rate


* Dangerous Free Kick Frequency





**Feature Selection**


Not every engineered feature contributes equally to predictive performance.
GLPM therefore performs feature selection during model development using:

* Correlation Analysis


* Mutual Information


* Recursive Feature Elimination


* Tree-Based Feature Importance


* SHAP Values



The objective is to maximise predictive power while minimising redundancy and overfitting.

---

#### 3.8 Opponent & Context Adjustment



**Purpose**


Raw attacking statistics are heavily influenced by the quality of opposition and the circumstances under which they were produced.
A team creating 2.0 xG against the league's strongest defence demonstrates greater attacking quality than a team creating the same value against the league's weakest defence.
Similarly, performances may be influenced by home advantage, player absences or unusual match conditions.

The purpose of this stage is to isolate the team's underlying attacking ability by adjusting observations for both opponent strength and contextual factors before estimating the Attack Components.

**Opponent Adjustment**


Each attacking observation is adjusted according to the defensive quality of the opposition.
Factors include:

* Opposition Defence Rating


* Opposition Goalkeeper Rating


* Opposition Pressing Rating


* Opposition Defensive Style



These adjustments ensure that attacking performances are evaluated relative to the difficulty of the opponent rather than in absolute terms.

**Context Adjustment**


Additional corrections are applied for factors that systematically influence attacking output.
Examples include:

* Home Advantage


* Rest Days


* Fixture Congestion


* Weather Conditions


* Altitude


* Travel Distance


* Red Cards


* Match State (leading, drawing, trailing)



Where appropriate, these effects are modelled separately to prevent contextual noise from becoming embedded within long-term team ratings.

**Preparing for Component Estimation**


Following opponent and context adjustment, the dataset now consists of:

* Cleaned observations


* Engineered features


* Standardised metrics


* Opponent-adjusted values


* Context-adjusted values



These adjusted features form the direct inputs to the Component Rating models introduced in the next sections of this chapter.

```text
Adjusted Features
      ↓
Component Models
      ↓
Domain Ratings
      ↓
Attack Rating

```

---

### Part III - Component Ratings



#### 3.9 Chance Volume Rating



**3.9.1 Purpose**


The purpose of the Chance Volume Rating is to estimate a team's underlying ability to consistently generate shooting opportunities.
Rather than evaluating the quality of individual chances, this component focuses exclusively on the frequency with which a team creates attacking opportunities. The underlying premise is that teams capable of repeatedly producing shots and entering dangerous attacking areas are more likely to sustain attacking success over the long term.
The Chance Volume Rating forms one of the two Component Ratings used to estimate the Creation Rating.

**3.9.2 Football Interpretation**


A high Chance Volume Rating indicates that a team consistently creates opportunities to shoot regardless of short-term finishing performance.
Teams with high ratings typically:

* Generate a large number of shots.


* Frequently enter the opposition penalty area.


* Sustain attacking pressure.


* Produce repeated attacking sequences.


* Spend prolonged periods in advanced territory.



This rating deliberately ignores whether those chances result in goals.

**3.9.3 Raw Inputs**


Representative variables include:

* Total Shots


* Non-Penalty Shots


* Box Entries


* Touches in Opposition Box


* Big Chances Created


* Shot-Assisting Actions


* Final Third Entries


* Offensive Possessions



**3.9.4 Engineered Features**


Example engineered features include:

* Shots per 90


* Non-Penalty Shots per 90


* Box Entries per Possession


* Shot Frequency


* Attacking Sequence Frequency


* Big Chances per Match


* Shots per Final Third Entry


* Sustained Pressure Rate



**3.9.5 Statistical Estimation**


Raw observations are adjusted for:

* Opposition Defence Rating


* Match Context


* Home Advantage


* Player Availability



The adjusted features are combined using statistical learning methods to estimate the latent Chance Volume Rating.

**3.9.6 Machine Learning Model**


Candidate models include:

* Gradient Boosted Trees


* Random Forests


* Bayesian Hierarchical Models


* Elastic Net Regression



Model selection is determined through cross-validation and predictive performance rather than algorithm preference.

**3.9.7 Outputs**


The Chance Volume Model stores:

* Chance Volume Rating


* Confidence Score


* Rating Variance


* Historical Trend


* Last Updated



**3.9.8 Relationship to Creation Rating**


The Chance Volume Rating represents one half of the Creation Rating.
It is combined with the Chance Quality Rating to estimate a team's overall ability to generate dangerous scoring opportunities.

**3.9.9 Rating Interpretation**


The Chance Volume Rating is expressed on a standardized scale, allowing comparisons across teams and seasons.

| Rating | Interpretation | Typical Characteristics |
| --- | --- | --- |
| **90-100** | Elite | Consistently generates very high shot volumes against strong opposition. |
| **80-89** | Excellent | Regularly creates a large number of attacking opportunities. |
| **70-79** | Strong | Above-average chance generation with sustained attacking threat. |
| **60-69** | Average | Generates opportunities at approximately league-average levels. |
| **50-59** | Below Average | Struggles to consistently create shooting opportunities. |
| **40-49** | Poor | Limited attacking production across most matches. |
| **Below 40** | Very Poor | Rarely generates meaningful attacking opportunities. |
| <br><br> |  |  |

---

#### 3.10 Chance Quality Rating



**3.10.1 Purpose**


The Chance Quality Rating estimates the quality of opportunities a team creates.
While Chance Volume measures how often a team shoots, Chance Quality measures how dangerous those shots are.

**3.10.2 Football Interpretation**


Teams with high Chance Quality Ratings consistently create:

* High xG opportunities.


* Central shooting locations.


* Close-range shots.


* One-on-one situations.


* High-quality cutback opportunities.



A lower volume of excellent chances is often more valuable than a high volume of poor-quality shots.

**3.10.3 Raw Inputs**


Variables include:

* Expected Goals


* Shot Location


* Shot Angle


* Big Chances


* Through Balls Leading to Shots


* Cutback Opportunities


* Cross Type


* Assists



**3.10.4 Engineered Features**


Examples include:

* xG per Shot


* Big Chance Percentage


* Average Shot Distance


* Central Shot Percentage


* Shot Angle Distribution


* High-Value Shot Frequency



**3.10.5 Statistical Estimation**


Observations are adjusted for:

* Opposition Defence Rating


* Goalkeeper Rating


* Match Context


* Home Advantage



The resulting adjusted features estimate the latent Chance Quality Rating.

**3.10.6 Machine Learning Model**


Candidate models include:

* XGBoost


* LightGBM


* Bayesian Regression


* Neural Networks (future implementation)



**3.10.7 Outputs**

* Chance Quality Rating


* Confidence Score


* Rating Variance


* Historical Trend



**3.10.8 Relationship to Creation Rating**


The Chance Quality Rating is combined with the Chance Volume Rating to estimate the Creation Rating.
Together, these two components measure both the quantity and quality of a team's chance creation.

---

#### 3.11 Ball Progression Rating



**3.11.1 Purpose**


The Ball Progression Rating measures a team's ability to advance possession into dangerous attacking areas.
Unlike the Creation components, which evaluate shooting opportunities, Ball Progression focuses on the earlier stages of attack construction.

**3.11.2 Football Interpretation**


Teams with high Ball Progression Ratings consistently:

* Progress the ball efficiently.


* Break opposition defensive lines.


* Reach advanced areas.


* Maintain attacking momentum.



**3.11.3 Raw Inputs**


Variables include:

* Progressive Passes


* Progressive Carries


* Final Third Entries


* Penalty Area Entries


* Deep Completions


* Line-Breaking Passes



**3.11.4 Engineered Features**


Examples include:

* Progressive Pass Rate


* Progressive Carry Rate


* Final Third Progression


* Penalty Area Entry Rate


* Average Progression Distance


* Dangerous Progressions



**3.11.5 Statistical Estimation**


Features are adjusted for:

* Opposition Pressing Rating


* Opposition Defensive Shape


* Context Variables



before estimating the latent Ball Progression Rating.

**3.11.6 Machine Learning Model**


Models considered include:

* Gradient Boosting


* Random Forests


* Bayesian Hierarchical Models



**3.11.7 Outputs**

* Ball Progression Rating


* Confidence Score


* Historical Trend



**3.11.8 Relationship to Progression Rating**


The Ball Progression Rating combines with the Territorial Control Rating to estimate the Progression Rating.

---

#### 3.12 Territorial Control Rating



**3.12.1 Purpose**


The Territorial Control Rating measures a team's ability to establish and sustain attacking pressure in advanced areas of the pitch.
Rather than focusing on individual attacks, it captures long-term territorial dominance.

**3.12.2 Football Interpretation**


Teams with high Territorial Control Ratings:

* Dominate possession in advanced areas.


* Spend extended periods in the attacking third.


* Sustain pressure around the penalty area.


* Force opponents into deep defensive positions.



**3.12.3 Raw Inputs**


Variables include:

* Possession Percentage


* Field Tilt


* Final Third Possession


* Attacking Third Touches


* Territory Percentage


* Passes in Final Third



**3.12.4 Engineered Features**


Examples include:

* Field Tilt Percentage


* Territory Ratio


* Sustained Pressure Rate


* Final Third Occupancy


* Possession in Dangerous Zones



**3.12.5 Statistical Estimation**


Adjustments account for:

* Opposition Pressing Rating


* Match Context


* Home Advantage



before estimating the latent Territorial Control Rating.

**3.12.6 Machine Learning Model**


Suitable algorithms include:

* Gradient Boosted Trees


* Elastic Net Regression


* Bayesian Models



**3.12.7 Outputs**

* Territorial Control Rating


* Confidence Score


* Rating Variance


* Historical Trend



**3.12.8 Relationship to Progression Rating**


The Territorial Control Rating complements the Ball Progression Rating by measuring a team's ability to sustain attacks once possession has reached advanced areas.
Together, these components are combined to estimate the Progression Rating.

---

#### 3.13 Transition Threat Rating



**3.13.1 Purpose**


The Transition Threat Rating measures a team's ability to create dangerous attacking opportunities immediately following possession regains. Unlike sustained attacking phases, transition attacks exploit temporary defensive imbalance before the opposition can reorganise.
This component captures the effectiveness of fast attacks, counter-attacks and direct progression following defensive recoveries.
The Transition Threat Rating forms one of the two Component Ratings used to estimate the Situational Rating.

**3.13.2 Football Interpretation**


Teams with high Transition Threat Ratings consistently:

* Attack quickly after regaining possession.


* Exploit numerical advantages.


* Create high-value counter-attacking opportunities.


* Progress vertically with minimal passes.


* Punish opposition turnovers.



The rating reflects attacking efficiency during transitional moments rather than overall attacking strength.

**3.13.3 Raw Inputs**


Representative variables include:

* Counter-Attack Attempts


* Fast Breaks


* Transition xG


* Possession Regains


* Progressive Carries After Recovery


* Progressive Passes After Recovery


* Direct Attacks


* Time to Shot After Recovery



**3.13.4 Engineered Features**


Examples include:

* Transition xG per Recovery


* Fast Break Frequency


* Counter-Attack Conversion Rate


* Average Time to Shot


* Direct Attack Frequency


* Progressive Distance After Recovery



**3.13.5 Statistical Estimation**


Features are adjusted for:

* Opposition Defensive Organisation


* Opposition Pressing Rating


* Match State


* Home Advantage


* Context Variables



The adjusted observations are then used to estimate the latent Transition Threat Rating.

**3.13.6 Machine Learning Model**


Candidate algorithms include:

* Gradient Boosted Trees


* Bayesian Hierarchical Models


* Random Forests


* Elastic Net Regression



The final model is selected according to predictive accuracy and calibration performance.

**3.13.7 Outputs**


The Transition Threat Model stores:

* Transition Threat Rating


* Confidence Score


* Rating Variance


* Historical Trend


* Last Updated



**3.13.8 Relationship to Situational Rating**


The Transition Threat Rating measures attacking effectiveness during open-play transitions.
It is combined with the Set Piece Threat Rating to estimate the team's overall Situational Rating.

---

#### 3.14 Set Piece Threat Rating



**3.14.1 Purpose**


The Set Piece Threat Rating measures a team's ability to create dangerous scoring opportunities from structured dead-ball situations.
It evaluates attacking effectiveness from corners, indirect free kicks, direct free kicks and throw-ins where applicable.
The Set Piece Threat Rating forms the second Component Rating contributing to the Situational Rating.

**3.14.2 Football Interpretation**


Teams with high Set Piece Threat Ratings consistently:

* Generate high-quality chances from corners.


* Execute dangerous free-kick routines.


* Produce effective aerial opportunities.


* Create repeatable scoring situations from dead-ball plays.



This rating reflects structured attacking ability independent of open-play performance.

**3.14.3 Raw Inputs**


Representative variables include:

* Corner xG


* Free Kick xG


* Corner Delivery Success


* Shot Attempts from Set Pieces


* Goals from Set Pieces


* Aerial Duel Success


* Dangerous Throw-ins



**3.14.4 Engineered Features**


Examples include:

* Set Piece xG per Match


* Corner Conversion Rate


* Dangerous Delivery Rate


* Set Piece Shot Frequency


* Aerial Threat Index


* Direct Free Kick Threat



**3.14.5 Statistical Estimation**


Adjustments account for:

* Opposition Set Piece Defence


* Goalkeeper Rating


* Match Context


* Home Advantage



The adjusted features estimate the latent Set Piece Threat Rating.

**3.14.6 Machine Learning Model**


Candidate algorithms include:

* Gradient Boosting


* Bayesian Regression


* Random Forests



Selection is determined through cross-validation and predictive performance.

**3.14.7 Outputs**


The Set Piece Threat Model stores:

* Set Piece Threat Rating


* Confidence Score


* Rating Variance


* Historical Trend


* Last Updated



**3.14.8 Relationship to Situational Rating**


The Set Piece Threat Rating captures attacking performance from structured dead-ball situations.
Together with the Transition Threat Rating it estimates the team's overall Situational Rating.

---

### Part IV - Rating Calibration



#### 3.15 Rating Calibration and Interpretation



**3.15.1 Purpose**


All latent ratings produced within the Graham League Prediction Model are calibrated onto a common numerical scale. This ensures that every Component Rating, Domain Rating and Primary Rating can be interpreted consistently across teams, competitions and seasons.

A standardised calibration framework also enables meaningful comparisons between different aspects of team performance while maintaining consistency throughout the model.

**3.15.2 GLPM Rating Scale**


All GLPM ratings are interpreted using the following classification.

| Rating | Classification |
| --- | --- |
| 90-100 | Elite |
| 80-89 | Excellent |
| 70-79 | Strong |
| 60-69 | Average |
| 50-59 | Below Average |
| 40-49 | Poor |
| Below 40 | Very Poor |
| <br><br> |  |

These classifications apply uniformly to Component Ratings, Domain Ratings and Primary Ratings.

**3.15.3 Performance Bands**


Performance Bands describe a team's standing relative to all teams within the calibrated dataset.

| Percentile | Classification |
| --- | --- |
| Top 5% | Elite |
| 80-95% | Excellent |
| 60-80% | Strong |
| 40-60% | Average |
| 20-40% | Below Average |
| 5-20% | Poor |
| Bottom 5% | Very Poor |
| <br><br> |  |

While the GLPM Rating Scale provides an absolute interpretation of model outputs, Performance Bands provide a relative assessment within the current competitive environment.

**3.15.4 Calibration Process**


Following estimation, all latent ratings are transformed onto the common GLPM Rating Scale.
The calibration process is designed to:

* Maintain comparability across seasons.


* Preserve relative differences between teams.


* Support cross-league comparisons.


* Reduce rating drift following model retraining.



Each rating is accompanied by confidence metrics and uncertainty estimates, allowing the model to distinguish between stable long-term ratings and estimates based on limited observations.

**3.15.5 Interpretation Guidelines**


Example interpretations are shown below.

| Rating | Interpretation |
| --- | --- |
| Chance Volume Rating = 91 | Elite chance generation. |
| Ball Progression Rating = 74 | Strong ability to progress possession. |
| Set Piece Threat Rating = 58 | Slightly below-average dead-ball threat. |
| <br><br> |  |

These examples illustrate the interpretation of individual Component Ratings. The same framework applies equally to Domain Ratings and Primary Ratings throughout GLPM.

---

### Part V - Domain Ratings



#### 3.16 Domain Ratings



**3.16.1 Purpose**


Domain Ratings combine related Component Ratings into broader measures of attacking ability.
They provide an intermediate level of abstraction between specialised attacking processes and the overall Attack Rating.
This hierarchical structure improves interpretability, reduces redundancy between correlated components, and simplifies the estimation of the overall Attack Rating.

**3.16.2 Creation Rating**


The Creation Rating measures a team's ability to generate scoring opportunities through both the quantity and quality of chances created.
It is estimated by combining:

* Chance Volume Rating


* Chance Quality Rating



Teams with high Creation Ratings consistently produce numerous high-quality scoring opportunities regardless of finishing performance.

**3.16.3 Progression Rating**


The Progression Rating measures a team's ability to move possession into dangerous attacking areas while maintaining territorial pressure.
It is estimated by combining:

* Ball Progression Rating


* Territorial Control Rating



High Progression Ratings indicate teams capable of consistently advancing possession and sustaining attacks in advanced areas.

**3.16.4 Situational Rating**


The Situational Rating measures attacking effectiveness during specialised phases of play where tactical execution is particularly important.
It is estimated by combining:

* Transition Threat Rating


* Set Piece Threat Rating



High Situational Ratings indicate teams that exploit transition opportunities efficiently and consistently create danger from set-piece situations.

**3.16.5 Domain Rating Estimation**


Each Domain Rating is estimated using statistical and machine learning techniques that learn the optimal contribution of each Component Rating.

Conceptually:

* Creation Rating = f(Chance Volume Rating, Chance Quality Rating)


* Progression Rating = f(Ball Progression Rating, Territorial Control Rating)


* Situational Rating = f(Transition Threat Rating, Set Piece Threat Rating)



The weighting of each Component Rating is learned from historical data rather than being manually assigned.

**3.16.6 Relationship to the Attack Rating**


The three Domain Ratings represent the final intermediate layer before the overall Attack Rating is estimated.
Together they summarise a team's attacking profile across:

* Opportunity Creation


* Ball Advancement and Territorial Control


* Specialised Attacking Situations



These Domain Ratings are then combined to estimate the latent Attack Rating, which serves as the primary attacking input to the Expected Goals Engine.

**Chapter 3 Hierarchy Summary**

```text
Historical Match Data
      ↓
Engineered Features
      ↓
Component Ratings
  * Chance Volume
  * Chance Quality
  * Ball Progression
  * Territorial Control
  * Transition Threat
  * Set Piece Threat
      ↓
Domain Ratings
  * Creation Rating
  * Progression Rating
  * Situational Rating
      ↓
Attack Rating
      ↓
Expected Goals Engine

```

---

### Part VI - Primary Rating



#### 3.17 Attack Rating Estimation



**3.17.1 Purpose**


The Attack Rating represents the highest-level latent measure of a team's attacking ability within the Graham League Prediction Model. It combines the three Domain Ratings into a single estimate of long-term attacking strength that serves as a principal input to the Expected Goals Engine.

Unlike traditional football ratings based solely on goals scored or expected goals, the Attack Rating integrates multiple independent aspects of attacking performance while accounting for opponent strength, contextual effects and statistical uncertainty.

**3.17.2 Inputs**


The Attack Rating is estimated from the following Domain Ratings:

* Creation Rating


* Progression Rating


* Situational Rating



Each Domain Rating summarises a distinct dimension of attacking performance and is itself derived from independently estimated Component Ratings.

**3.17.3 Mathematical Definition**


The latent Attack Rating for team i is defined as

$$A_{i}=f(S_{i})$$


where:

* $A_{i}=$ Attack Rating


* $C_{i}=$ Creation Rating


* $P_{i}=$ Progression Rating


* $S_{i}=$ Situational Rating



The function $f(\cdot)$ is learned from historical match data using statistical and machine learning techniques. No fixed weighting is imposed on the three Domain Ratings.

**3.17.4 Estimation Process**


The Attack Rating estimation follows four stages:

1. Estimate Component Ratings.


2. Combine Component Ratings into Domain Ratings.


3. Learn the relationship between Domain Ratings and future attacking performance.


4. Produce the final calibrated Attack Rating.



Each stage is independently validated before contributing to the next layer of the hierarchy.

**3.17.5 Model Outputs**


The Attack Rating Model produces:

* Attack Rating


* Rating Confidence


* Rating Variance


* Historical Trend


* Last Updated


* Prediction Uncertainty



These outputs provide both a point estimate of attacking strength and measures of estimation reliability.

**3.17.6 Relationship to the Expected Goals Engine**


The Attack Rating is not a prediction of goals scored.
Instead, it acts as one of the primary inputs to the Expected Goals Engine, where it interacts with:

* Opposition Defence Rating


* Tactical Interaction Engine


* Context Variables


* Player Availability


* Home Advantage



Together, these inputs produce fixture-specific expected goals.

---

#### 3.18 Model Validation and Performance Evaluation



**3.18.1 Purpose**


The objective of model validation is to ensure that the Attack Rating accurately captures underlying attacking ability and improves predictive performance for future matches.
Validation is performed at each stage of the modelling hierarchy, from Component Ratings through to the final Attack Rating.

**3.18.2 Component Validation**


Each Component Rating is evaluated independently.
Typical evaluation criteria include:

* Stability over time.


* Predictive contribution.


* Correlation with future attacking performance.


* Robustness across competitions.


* Sensitivity to opponent quality.



**3.18.3 Domain Validation**


Domain Ratings are evaluated by assessing whether they provide additional predictive information beyond the individual Component Ratings.
This ensures that the hierarchical aggregation improves model performance rather than introducing unnecessary complexity.

**3.18.4 Attack Rating Validation**


The Attack Rating is evaluated against future attacking outcomes rather than historical goals alone.
Representative validation metrics include:

* Expected Goals Prediction Error


* Mean Absolute Error (MAE)


* Root Mean Squared Error (RMSE)


* Log Loss


* Brier Score (for probability forecasts)


* Calibration Error



The chosen evaluation metrics depend on the prediction task being assessed.

**3.18.5 Continuous Validation**


Validation is not a one-time process.
Model performance is continuously monitored as new match data become available. Significant deterioration in predictive performance triggers model review, recalibration or retraining where appropriate.

---

#### 3.19 Bayesian Updating and Rating Evolution



**3.19.1 Purpose**


Football teams evolve continuously through tactical changes, player transfers, injuries and managerial appointments.
The Attack Rating must therefore adapt over time while remaining robust against short-term randomness.

**3.19.2 Bayesian Updating**


GLPM adopts a Bayesian updating framework in which each new match provides additional evidence regarding a team's underlying attacking ability.
Existing ratings act as prior estimates, while new observations update these beliefs according to their statistical reliability.
This approach allows ratings to evolve smoothly without overreacting to individual match outcomes.

**3.19.3 Rating Confidence**


Each Attack Rating is accompanied by a confidence estimate.
Confidence increases as:

* More matches are observed.


* Team performance becomes more consistent.


* Model uncertainty decreases.



Conversely, confidence may decline following substantial squad changes or prolonged periods without competitive matches.

**3.19.4 Rating Drift**


To prevent outdated information from dominating future predictions, historical observations gradually receive less weight through time-decay mechanisms.
Recent performances therefore contribute more strongly to rating updates while preserving long-term stability.

**3.19.5 Recalibration**


Periodic recalibration ensures that the rating scale remains comparable across seasons, competitions and changing football environments.
Recalibration does not alter the conceptual interpretation of the Attack Rating but maintains consistency within the broader GLPM framework.

---

#### 3.20 Chapter Summary



This chapter has defined the methodology used to estimate the Attack Rating within the Graham League Prediction Model.

Beginning with historical match data, raw observations were transformed into engineered features before being used to estimate six specialised Component Ratings:

* Chance Volume Rating


* Chance Quality Rating


* Ball Progression Rating


* Territorial Control Rating


* Transition Threat Rating


* Set Piece Threat Rating



These Component Ratings were then aggregated into three Domain Ratings:

* Creation Rating


* Progression Rating


* Situational Rating



Finally, the Domain Ratings were combined to estimate the latent Attack Rating, which serves as the primary attacking input to the Expected Goals Engine.

The chapter also introduced the common GLPM Rating Scale, model validation procedures and Bayesian updating framework that ensure ratings remain interpretable, robust and adaptive over time.
Collectively, these components establish a modular and extensible attacking model capable of supporting accurate fixture prediction while providing meaningful insight into the underlying processes that drive attacking performance.

**Blueprint for the entire attacking model:**

```text
Historical Match Data
      ↓
Feature Engineering
      ↓
Component Ratings
  * Chance Volume
  * Chance Quality
  * Ball Progression
  * Territorial Control
  * Transition Threat
  * Set Piece Threat
      ↓
Domain Ratings
  * Creation Rating
  * Progression Rating
  * Situational Rating
      ↓
Attack Rating
      ↓
Expected Goals Engine
      ↓
Scoreline Distribution
      ↓
Match Outcome Probabilities

```