# Chapter 9 – Finishing Rating

# Part I – Foundations

# 9.1 Purpose

## 9.1.1 Objective

The **Finishing Rating** is the Primary Rating within the Graham League Prediction Model (GLPM) that estimates a team's underlying ability to convert goal-scoring opportunities into goals through efficient, technically proficient and composed finishing.  
Rather than relying solely on goals scored, the Finishing Rating captures the repeatable technical and tactical processes that determine how effectively a team converts chances of varying quality into successful outcomes.

## 9.1.2 Scope

The Finishing Rating evaluates three fundamental dimensions of finishing performance:

* Executing shots with technical quality and accuracy.   
* Converting scoring opportunities efficiently relative to chance quality.   
* Maintaining composure when finishing under different match situations. 

These dimensions are estimated independently before being combined within GLPM's hierarchical rating framework.

## 9.1.3 Outputs

The Finishing Rating Model produces:

* Finishing Rating   
* Shot Execution Rating   
* Chance Conversion Rating   
* Finishing Composure Rating   
* Six Component Ratings   
* Rating Confidence   
* Rating Variance   
* Historical Trend   
* Last Updated Timestamp 

# 9.2 Philosophy

## 9.2.1 Measuring Finishing Ability

Goals are influenced by many factors beyond finishing ability, including chance quality, opposition defending and goalkeeper performance.  
Consequently, goals scored alone are an unreliable measure of finishing quality.  
Within GLPM, finishing ability is primarily evaluated relative to the quality of chances created. Teams that consistently score more goals than expected demonstrate stronger underlying finishing ability, while teams that consistently underperform their expected goals indicate weaker finishing performance.  
Accordingly, GLPM models finishing as a latent football ability representing a team's repeatable capacity to execute shots, convert opportunities and remain composed in front of goal.

## 9.2.2 Goals Minus Expected Goals

A central concept within the Finishing Rating is the relationship between **Goals Scored** and **Expected Goals (xG)**.  
Conceptually,  
G=Goals-xG  
where:

* Positive values indicate finishing performance above expectation.   
* Negative values indicate finishing performance below expectation. 

While short-term differences may reflect randomness, persistent overperformance or underperformance across large samples provides valuable evidence of underlying finishing ability.  
Accordingly, **Goals − xG** serves as one of the primary statistical signals used throughout the Finishing Rating estimation process.  
The remaining Component Ratings explain the technical and tactical mechanisms responsible for this observed finishing performance.

## 9.2.3 Hierarchical Finishing Architecture

The Finishing Rating is estimated using a hierarchical structure comprising Component Ratings, Domain Ratings and a Primary Rating.  
Finishing Rating  
│  
├── Shot Execution Rating  
│   ├── Shot Accuracy Rating  
│   └── Shot Technique Rating  
│  
├── Chance Conversion Rating  
│   ├── Finishing Efficiency Rating  
│   └── Clinical Finishing Rating  
│  
└── Finishing Composure Rating  
    ├── One-on-One Finishing Rating  
│   └── Pressure Finishing Rating  
This hierarchical structure separates the technical execution of shots, finishing efficiency and psychological composure into distinct latent abilities.

## 9.2.4 Shot Execution Rating

The **Shot Execution Rating** measures the technical quality of shot execution.  
It is estimated from:

* Shot Accuracy Rating   
* Shot Technique Rating 

Together these Component Ratings evaluate the consistency, precision and technical proficiency of finishing actions.

## 9.2.5 Chance Conversion Rating

The **Chance Conversion Rating** measures how efficiently a team converts scoring opportunities into goals after accounting for the quality of chances created.  
It is estimated from:

* Finishing Efficiency Rating   
* Clinical Finishing Rating 

These Component Ratings evaluate both overall finishing efficiency and the ability to consistently convert high-probability scoring opportunities.

## 9.2.6 Finishing Composure Rating

The **Finishing Composure Rating** measures a team's ability to remain composed and execute technically sound finishes during high-pressure situations.  
It is estimated from:

* One-on-One Finishing Rating   
* Pressure Finishing Rating 

Together these Component Ratings evaluate psychological control and technical execution when finishing under defensive pressure.

## 9.2.7 Why a Hierarchical Model?

Representing finishing through a hierarchy of latent ratings provides several advantages:

* Separates technical execution from chance conversion.   
* Distinguishes composure from shooting mechanics.   
* Improves model interpretability.   
* Reduces redundancy between correlated variables.   
* Produces stable estimates across seasons.   
* Improves downstream prediction within the Expected Goals Engine. 

Rather than treating goals scored as the sole indicator of finishing quality, GLPM estimates the underlying football abilities that collectively determine a team's long-term finishing performance.

# 9.3 Mathematical Definition

## 9.3.1 Purpose

The Finishing Rating is estimated using a hierarchical latent-variable model.  
Historical match observations are transformed into engineered features before estimating Component Ratings, which are aggregated into Domain Ratings and ultimately combined into the overall Finishing Rating.  
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
Finishing Rating

## 9.3.2 Domain Ratings

The Finishing Rating is composed of three Domain Ratings.

| Symbol | Domain Rating |
| ----- | ----- |
| SE | Shot Execution Rating |
| CC | Chance Conversion Rating |
| FC | Finishing Composure Rating |

## 9.3.3 Component Ratings

Each Domain Rating is estimated from specialised Component Ratings.

| Symbol | Component Rating |
| ----- | ----- |
| SA | Shot Accuracy Rating |
| ST | Shot Technique Rating |
| FE | Finishing Efficiency Rating |
| CF | Clinical Finishing Rating |
| OO | One-on-One Finishing Rating |
| PF | Pressure Finishing Rating |

## 9.3.4 Hierarchical Estimation

The relationships are defined conceptually as  
SE=fASTCC=fECFFC=fOPF  
The overall Finishing Rating is then estimated as  
FR=fCCFC  
where:

* **FR** \= Finishing Rating   
* **SE** \= Shot Execution Rating   
* **CC** \= Chance Conversion Rating   
* **FC** \= Finishing Composure Rating 

The functions are learned from historical data using statistical and machine learning methods.

## 9.3.5 Relationship to the Expected Goals Engine

The Finishing Rating provides one of the Primary Ratings used within the Expected Goals Engine.  
Conceptually,  
xG=gOPRFRM  
where:

* **A** \= Attack Rating   
* **D** \= Defence Rating   
* **GK** \= Goalkeeper Rating   
* **BU** \= Build-Up Rating   
* **PO** \= Possession Rating   
* **PR** \= Pressing Rating   
* **FR** \= Finishing Rating   
* **M** \= Match Context Variables 

While the Attack Rating estimates the ability to **create** chances, the Finishing Rating estimates the ability to **convert** those chances into goals. Together, these complementary ratings provide a more complete representation of attacking performance within GLPM.

# 9.4 Football Interpretation

## 9.4.1 Interpreting the Finishing Rating

Teams with high Finishing Ratings consistently convert scoring opportunities above expectation through superior technical execution, efficient chance conversion and composed finishing.  
High ratings reflect sustainable finishing ability rather than short-term fluctuations in goals scored.

## 9.4.2 Relationship Between the Domain Ratings

The three Domain Ratings capture complementary aspects of finishing performance.

* **Shot Execution Rating** measures the technical quality of striking the ball.   
* **Chance Conversion Rating** measures finishing efficiency relative to expected goals.   
* **Finishing Composure Rating** measures performance under pressure and in decisive situations. 

Together these ratings provide a comprehensive representation of a team's finishing ability.

## 9.4.3 Role Within GLPM

The Finishing Rating represents a team's ability to convert opportunities into goals.  
It complements the Attack Rating by measuring what happens **after** chances are created, completing the offensive side of the GLPM framework.  
Within GLPM, the Finishing Rating serves as the final Primary Rating contributing to the Expected Goals Engine.

# 9.5 Data Sources and Raw Inputs

## 9.5.1 Purpose

The Finishing Rating is estimated using historical match observations describing how teams execute shots, convert scoring opportunities and perform relative to the quality of chances created.  
Rather than relying solely on goals scored, GLPM combines event-level and shot-level observations that capture the technical and tactical processes underlying consistent finishing performance.  
These observations form the foundation for feature engineering and the estimation of the six Finishing Component Ratings.

## 9.5.2 Data Sources

Historical finishing data are collected from structured football datasets, including event-based and tracking data where available.  
Typical data sources include:

* Event Data   
* Match Statistics   
* Shot Event Data   
* Expected Goals (xG) Models   
* Player Tracking Data   
* Goalkeeper Event Data 

Each observation is linked to the relevant team, opponent, competition, season and match context.

## 9.5.3 Finishing Data Categories

Raw observations are organised into several categories representing different aspects of finishing performance.

| Category | Example Variables |
| ----- | ----- |
| Shot Accuracy | Shots on Target, Off Target, Blocked Shots, Shot Placement |
| Shot Technique | Shot Type, Weak Foot, Headers, Volleys, First-Time Shots |
| Finishing Efficiency | Goals, xG, Goals per Shot, Goals per xG |
| Clinical Finishing | Big Chances, Big Chances Scored, Big Chances Missed |
| One-on-One Finishing | One-on-One Attempts, One-on-One Goals |
| Pressure Finishing | Defensive Pressure, Shot Pressure, Contested Finishes |

These observations collectively describe a team's ability to convert scoring opportunities into goals.

## 9.5.4 Goals Minus Expected Goals (Goals − xG)

A central input to the Finishing Rating is the relationship between goals scored and expected goals.  
For each observation,  
G=Goals-xG  
Persistent positive values indicate above-expected finishing performance, while persistent negative values indicate below-expected finishing performance.  
Unlike raw goals scored, this measure adjusts for chance quality and therefore provides a more reliable estimate of underlying finishing ability.  
Within GLPM, **Goals − xG** serves as one of the principal statistical signals used throughout the Finishing Rating estimation process.

## 9.5.5 Data Granularity

Finishing observations may be recorded at multiple levels.  
These include:

* Match Level   
* Team Level   
* Possession Level   
* Shot Level   
* Individual Finishing Event Level 

Shot-level observations provide the highest precision for estimating finishing performance.

# 9.6 Data Preparation and Cleaning

## 9.6.1 Purpose

Raw finishing observations frequently contain inconsistencies resulting from differences in shot definitions, event providers and expected goals models.  
The preparation stage standardises these observations before feature engineering and statistical estimation.

## 9.6.2 Data Cleaning

The cleaning process includes:

* Removal of duplicate shot events.   
* Validation of shot outcomes.   
* Standardisation of player and team identifiers.   
* Correction of event timestamps.   
* Verification of shot sequencing.   
* Removal of invalid observations. 

Only validated observations are retained for modelling.

## 9.6.3 Missing Data

Missing observations are handled using statistically appropriate imputation techniques.  
Possible approaches include:

* Bayesian Imputation   
* Historical Team Priors   
* League-Level Priors   
* Model-Based Imputation 

The selected approach depends on data availability and observation reliability.

## 9.6.4 Normalisation

To improve comparability across competitions and tactical systems, variables are normalised where appropriate.  
Typical transformations include:

* Per 90 Minutes   
* Per Shot   
* Per Shot on Target   
* Per Expected Goal   
* Per Big Chance 

These transformations reduce systematic bias arising from differences in attacking volume.

## 9.6.5 Outlier Detection

Extreme observations are evaluated using robust statistical procedures.  
Potential outliers include:

* Matches with unusually high shot volumes.   
* Exceptional finishing performances.   
* Very low expected goals.   
* Severe weather conditions.   
* Data collection anomalies. 

Where appropriate, observations may be winsorised or assigned reduced statistical weight.

# 9.7 Feature Engineering

## 9.7.1 Purpose

Feature engineering transforms raw finishing observations into statistically informative variables representing the underlying abilities associated with consistent finishing.  
These engineered features provide the inputs for estimating the six Component Ratings.

## 9.7.2 Shot Accuracy Features

Representative features include:

* Shot Accuracy Percentage   
* Shots on Target Percentage   
* Target Placement Index   
* Corner Placement Rate   
* Central Miss Rate   
* Shot Precision Score 

These variables estimate the consistency with which shots are directed toward dangerous areas of the goal.

## 9.7.3 Shot Technique Features

Representative features include:

* Weak Foot Success Rate   
* Volley Success Rate   
* Header Success Rate   
* First-Time Finish Success   
* Technique Consistency Index   
* Shot Execution Score 

These variables estimate the technical quality and versatility of shot execution.

## 9.7.4 Finishing Efficiency Features

Representative features include:

* Goals per xG   
* Goals Minus Expected Goals   
* Conversion Rate   
* Goals per Shot   
* Non-Penalty Goals per xG   
* Finishing Efficiency Index 

These variables estimate how efficiently a team converts opportunities after accounting for chance quality.

## 9.7.5 Clinical Finishing Features

Representative features include:

* Big Chance Conversion Rate   
* Big Chances Missed   
* High-xG Shot Conversion   
* Clinical Finishing Index   
* Clear-Cut Chance Success   
* Expected Goal Overperformance in High-Value Chances 

These variables measure the consistency with which teams convert the opportunities most expected to result in goals.

## 9.7.6 One-on-One Finishing Features

Representative features include:

* One-on-One Conversion Rate   
* One-on-One Goals   
* One-on-One xG Overperformance   
* Goalkeeper Beat Rate   
* Close-Range Conversion   
* Finishing Composure Index 

These variables estimate finishing performance in direct encounters with the goalkeeper.

## 9.7.7 Pressure Finishing Features

Representative features include:

* Goals Under Defensive Pressure   
* Conversion Under Pressure   
* Pressure Shot Accuracy   
* Pressure Finishing Efficiency   
* Contested Goal Rate   
* Pressure Composure Score 

These variables estimate finishing quality when defensive pressure is present.

## 9.7.8 Feature Scaling

Following feature engineering, variables are transformed using statistically appropriate scaling procedures.  
Typical methods include:

* Standardisation   
* Robust Scaling   
* Logarithmic Transformation   
* Quantile Normalisation 

The selected transformation depends on the statistical distribution of each feature.

# 9.8 Context and Opposition Adjustment

## 9.8.1 Purpose

Observed finishing statistics are influenced by opposition quality, goalkeeper performance and match context.  
To estimate underlying finishing ability rather than observed outcomes, GLPM adjusts engineered features for contextual influences before estimating the Component Ratings.

## 9.8.2 Opposition Adjustment

Finishing observations are adjusted according to the quality of the opposition.  
Representative adjustments include:

* Opposition Defence Rating   
* Opposition Goalkeeper Rating   
* Opposition Pressing Rating   
* Opposition Tactical Style 

These adjustments ensure that scoring against stronger defensive opponents is appropriately recognised.

## 9.8.3 Tactical Adjustment

Additional adjustments account for differences in attacking philosophy.  
Representative variables include:

* Formation   
* Attacking Style   
* Crossing Frequency   
* Through Ball Frequency   
* Build-Up Style   
* Tactical Flexibility 

These adjustments reduce stylistic bias between teams employing different attacking approaches.

## 9.8.4 Match Context

Additional contextual adjustments include:

* Home Advantage   
* Match State   
* Rest Days   
* Fixture Congestion   
* Competition Type   
* Playing Surface   
* Weather Conditions 

These factors account for external influences on finishing performance.

## 9.8.5 Adjusted Finishing Features

Following contextual adjustment, the resulting engineered features provide unbiased estimates of a team's underlying finishing abilities.  
These adjusted features form the inputs to the six Component Rating models described in Part III.

## Chapter Pipeline Summary

Historical Match Data  
          │  
          ▼  
 Raw Finishing Observations  
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
Adjusted Finishing Features  
          │  
          ▼  
 Component Rating Models  
          │  
          ▼  
Shot Execution Rating  
Chance Conversion Rating  
Finishing Composure Rating  
          │  
          ▼  
    Finishing Rating

# 9.9 Shot Accuracy Rating

## 9.9.1 Purpose

The **Shot Accuracy Rating** measures a team's underlying ability to consistently direct shots toward dangerous areas of the goal, increasing the likelihood of scoring while reducing wasted shooting opportunities.  
The Shot Accuracy Rating forms one of the two Component Ratings used to estimate the **Shot Execution Rating**.

## 9.9.2 Football Interpretation

Teams with high Shot Accuracy Ratings consistently:

* Place shots on target.   
* Target difficult areas for goalkeepers to reach.   
* Minimise inaccurate shooting.   
* Demonstrate consistent shot placement.   
* Produce repeatable shooting precision. 

The rating reflects the consistency and precision of shot placement rather than shot volume.

## 9.9.3 Raw Inputs

Representative variables include:

* Shots on Target   
* Shots Off Target   
* Blocked Shots   
* Shot Placement   
* Goal Location   
* Shot Outcome 

## 9.9.4 Engineered Features

Representative features include:

* Shot Accuracy Percentage   
* Shot Precision Score   
* Target Placement Index   
* Corner Placement Rate   
* Central Miss Rate   
* On-Target Consistency 

## 9.9.5 Statistical Estimation

Features are adjusted for:

* Opposition Goalkeeper Rating   
* Opposition Defence Rating   
* Match Context   
* Competition Strength   
* Home Advantage 

The adjusted observations estimate the latent Shot Accuracy Rating.

## 9.9.6 Machine Learning Model

Candidate algorithms include:

* Gradient Boosted Trees   
* Bayesian Hierarchical Models   
* Random Forests   
* Elastic Net Regression 

The final model is selected according to predictive accuracy, calibration and long-term stability.

## 9.9.7 Outputs

The model stores:

* Shot Accuracy Rating   
* Confidence Score   
* Rating Variance   
* Historical Trend   
* Last Updated 

## 9.9.8 Relationship to Shot Execution Rating

The Shot Accuracy Rating combines with the Shot Technique Rating to estimate the **Shot Execution Rating**.

# 9.10 Shot Technique Rating

## 9.10.1 Purpose

The **Shot Technique Rating** measures the technical quality and consistency of shot execution across different finishing situations.  
The Shot Technique Rating forms one of the two Component Ratings contributing to the **Shot Execution Rating**.

## 9.10.2 Football Interpretation

Teams with high Shot Technique Ratings consistently:

* Execute technically clean finishes.   
* Finish effectively with either foot.   
* Convert headers efficiently.   
* Execute volleys and first-time finishes.   
* Adapt technique to different scoring opportunities. 

The rating reflects the technical execution of finishing rather than physical shot power.

## 9.10.3 Raw Inputs

Representative variables include:

* Weak Foot Shots   
* Headers   
* Volleys   
* First-Time Shots   
* Shot Type   
* Shot Outcome 

## 9.10.4 Engineered Features

Representative features include:

* Weak Foot Success Rate   
* Header Success Rate   
* Volley Success Rate   
* First-Time Finish Success   
* Technique Consistency Index   
* Shot Execution Score 

## 9.10.5 Statistical Estimation

Features are adjusted for:

* Opposition Goalkeeper Rating   
* Match Context   
* Competition Strength   
* Tactical Style 

The adjusted observations estimate the latent Shot Technique Rating.

## 9.10.6 Machine Learning Model

Candidate algorithms include:

* Gradient Boosted Trees   
* Bayesian Hierarchical Models   
* Random Forests 

## 9.10.7 Outputs

The model stores:

* Shot Technique Rating   
* Confidence Score   
* Rating Variance   
* Historical Trend   
* Last Updated 

## 9.10.8 Relationship to Shot Execution Rating

The Shot Technique Rating complements the Shot Accuracy Rating in estimating the **Shot Execution Rating**.

# 9.11 Finishing Efficiency Rating

## 9.11.1 Purpose

The **Finishing Efficiency Rating** measures how efficiently a team converts scoring opportunities into goals relative to the quality of chances created.  
The Finishing Efficiency Rating forms one of the two Component Ratings contributing to the **Chance Conversion Rating**.

## 9.11.2 Football Interpretation

Teams with high Finishing Efficiency Ratings consistently:

* Score more goals than expected.   
* Convert opportunities efficiently.   
* Sustain positive Goals − xG values.   
* Finish consistently across different chance qualities.   
* Demonstrate repeatable finishing performance. 

The rating reflects long-term finishing efficiency after accounting for chance quality.

## 9.11.3 Raw Inputs

Representative variables include:

* Goals   
* Expected Goals (xG)   
* Shots   
* Shots on Target   
* Non-Penalty Goals   
* Shot Outcomes 

## 9.11.4 Engineered Features

Representative features include:

* Goals Minus Expected Goals   
* Goals per xG   
* Goals per Shot   
* Conversion Rate   
* Non-Penalty Goals per xG   
* Finishing Efficiency Index 

## 9.11.5 Statistical Estimation

Features are adjusted for:

* Opposition Goalkeeper Rating   
* Opposition Defence Rating   
* Match Context   
* Competition Strength 

The adjusted observations estimate the latent Finishing Efficiency Rating.

## 9.11.6 Machine Learning Model

Candidate algorithms include:

* Gradient Boosted Trees   
* Bayesian Hierarchical Models   
* Random Forests 

## 9.11.7 Outputs

The model stores:

* Finishing Efficiency Rating   
* Confidence Score   
* Rating Variance   
* Historical Trend   
* Last Updated 

## 9.11.8 Relationship to Chance Conversion Rating

The Finishing Efficiency Rating combines with the Clinical Finishing Rating to estimate the **Chance Conversion Rating**.

# 9.12 Clinical Finishing Rating

## 9.12.1 Purpose

The **Clinical Finishing Rating** measures a team's ability to consistently convert high-probability scoring opportunities into goals.  
The Clinical Finishing Rating forms one of the two Component Ratings contributing to the **Chance Conversion Rating**.

## 9.12.2 Football Interpretation

Teams with high Clinical Finishing Ratings consistently:

* Convert clear-cut chances.   
* Minimise missed high-value opportunities.   
* Finish efficiently from close range.   
* Capitalise on defensive errors.   
* Demonstrate consistency in decisive moments. 

The rating reflects the ability to convert the opportunities most expected to become goals.

## 9.12.3 Raw Inputs

Representative variables include:

* Big Chances   
* Big Chances Scored   
* Big Chances Missed   
* High-xG Shots   
* Close-Range Shots   
* Goal Outcomes 

## 9.12.4 Engineered Features

Representative features include:

* Big Chance Conversion Rate   
* High-xG Shot Conversion   
* Clinical Finishing Index   
* Clear-Cut Chance Success   
* High-Value Chance Efficiency   
* Big Chance Overperformance 

## 9.12.5 Statistical Estimation

Features are adjusted for:

* Opposition Goalkeeper Rating   
* Match Context   
* Competition Strength   
* Tactical Style 

The adjusted observations estimate the latent Clinical Finishing Rating.

## 9.12.6 Machine Learning Model

Candidate algorithms include:

* Gradient Boosted Trees   
* Bayesian Hierarchical Models   
* Random Forests 

## 9.12.7 Outputs

The model stores:

* Clinical Finishing Rating   
* Confidence Score   
* Rating Variance   
* Historical Trend   
* Last Updated 

## 9.12.8 Relationship to Chance Conversion Rating

The Clinical Finishing Rating complements the Finishing Efficiency Rating in estimating the **Chance Conversion Rating**.

# 9.13 One-on-One Finishing Rating

## 9.13.1 Purpose

The **One-on-One Finishing Rating** measures a team's ability to convert direct scoring opportunities against the goalkeeper.  
The One-on-One Finishing Rating forms one of the two Component Ratings contributing to the **Finishing Composure Rating**.

## 9.13.2 Football Interpretation

Teams with high One-on-One Finishing Ratings consistently:

* Remain composed against advancing goalkeepers.   
* Select effective finishing techniques.   
* Convert close-range opportunities.   
* Beat goalkeepers efficiently.   
* Produce consistent one-on-one outcomes. 

The rating reflects finishing ability in isolated goalkeeper situations.

## 9.13.3 Raw Inputs

Representative variables include:

* One-on-One Attempts   
* One-on-One Goals   
* One-on-One xG   
* Goalkeeper Distance   
* Shot Outcome   
* Shot Location 

## 9.13.4 Engineered Features

Representative features include:

* One-on-One Conversion Rate   
* Goalkeeper Beat Rate   
* One-on-One xG Overperformance   
* Close-Range Conversion   
* Finishing Composure Index   
* One-on-One Success Score 

## 9.13.5 Statistical Estimation

Features are adjusted for:

* Opposition Goalkeeper Rating   
* Match Context   
* Competition Strength   
* Tactical Style 

The adjusted observations estimate the latent One-on-One Finishing Rating.

## 9.13.6 Machine Learning Model

Candidate algorithms include:

* Gradient Boosted Trees   
* Bayesian Hierarchical Models   
* Random Forests 

## 9.13.7 Outputs

The model stores:

* One-on-One Finishing Rating   
* Confidence Score   
* Rating Variance   
* Historical Trend   
* Last Updated 

## 9.13.8 Relationship to Finishing Composure Rating

The One-on-One Finishing Rating combines with the Pressure Finishing Rating to estimate the **Finishing Composure Rating**.

# 9.14 Pressure Finishing Rating

## 9.14.1 Purpose

The **Pressure Finishing Rating** measures a team's ability to execute technically sound finishes while under defensive pressure.  
The Pressure Finishing Rating forms one of the two Component Ratings contributing to the **Finishing Composure Rating**.

## 9.14.2 Football Interpretation

Teams with high Pressure Finishing Ratings consistently:

* Finish accurately despite defensive pressure.   
* Maintain composure in crowded penalty areas.   
* Convert contested opportunities.   
* Execute technically sound finishes under pressure.   
* Sustain finishing quality in difficult situations. 

The rating reflects composure and execution when defensive pressure is present.

## 9.14.3 Raw Inputs

Representative variables include:

* Pressure Shots   
* Pressure Goals   
* Contested Finishes   
* Defensive Pressure   
* Shot Outcome   
* Defender Proximity 

## 9.14.4 Engineered Features

Representative features include:

* Pressure Conversion Rate   
* Pressure Shot Accuracy   
* Pressure Finishing Efficiency   
* Pressure Composure Score   
* Contested Goal Rate   
* Pressure Success Index 

## 9.14.5 Statistical Estimation

Features are adjusted for:

* Opposition Goalkeeper Rating   
* Opposition Defence Rating   
* Match Context   
* Competition Strength 

The adjusted observations estimate the latent Pressure Finishing Rating.

## 9.14.6 Machine Learning Model

Candidate algorithms include:

* Gradient Boosted Trees   
* Bayesian Hierarchical Models   
* Random Forests 

## 9.14.7 Outputs

The model stores:

* Pressure Finishing Rating   
* Confidence Score   
* Rating Variance   
* Historical Trend   
* Last Updated 

## 9.14.8 Relationship to Finishing Composure Rating

The Pressure Finishing Rating complements the One-on-One Finishing Rating in estimating the **Finishing Composure Rating**.

# 9.15 Rating Calibration

## 9.15.1 Purpose

The Finishing Rating is calibrated to ensure that estimated ratings are statistically consistent, comparable across teams and competitions, and stable over time.  
Calibration transforms latent model outputs into standardized GLPM rating values that accurately reflect underlying finishing ability while minimizing the influence of short-term randomness.

## 9.15.2 Calibration Framework

The Finishing Rating follows the universal GLPM calibration methodology introduced in Chapter 3\.  
Calibration consists of four stages:

1. Latent Rating Estimation   
2. Scale Standardisation   
3. Reliability Adjustment   
4. Temporal Updating 

This process ensures consistency across all Primary Ratings within GLPM.

## 9.15.3 Scale Standardisation

Estimated ratings are transformed onto the common GLPM rating scale.  
The transformation preserves:

* Relative ranking   
* Rating intervals   
* Historical comparability   
* Cross-competition consistency 

This allows the Finishing Rating to be interpreted alongside all other Primary Ratings.

## 9.15.4 Reliability Adjustment

Each rating is adjusted according to the reliability of the available observations.  
Factors influencing reliability include:

* Number of matches   
* Number of shots   
* Number of scoring opportunities   
* Stability of historical performance   
* Model uncertainty 

Ratings supported by larger and more consistent samples receive greater statistical confidence.

## 9.15.5 Temporal Updating

Finishing ability evolves over time due to tactical changes, squad turnover and player development.  
GLPM updates ratings continuously using rolling historical observations while gradually reducing the influence of older performances.  
This ensures that the Finishing Rating reflects current team strength without overreacting to short-term fluctuations.

## 9.15.6 Calibration Outputs

The calibration process produces:

* Finishing Rating   
* Confidence Interval   
* Rating Variance   
* Reliability Score   
* Historical Trend   
* Timestamp 

# Part V – Domain Ratings

# 9.16 Shot Execution Rating

## 9.16.1 Purpose

The **Shot Execution Rating** measures the technical quality with which a team executes finishing actions.  
It combines the underlying abilities represented by the Shot Accuracy Rating and the Shot Technique Rating into a single latent measure of shooting execution.

## 9.16.2 Component Ratings

The Shot Execution Rating is estimated from:

* Shot Accuracy Rating   
* Shot Technique Rating 

These Component Ratings evaluate both where the shot is placed and how effectively it is executed.

## 9.16.3 Football Interpretation

Teams with high Shot Execution Ratings consistently:

* Produce accurate shots.   
* Execute technically clean finishes.   
* Adapt finishing technique across different situations.   
* Demonstrate repeatable shooting quality. 

The rating reflects the technical execution of finishing rather than finishing efficiency alone.

## 9.16.4 Mathematical Definition

Conceptually,  
SE=fAST  
where:

* **SE** \= Shot Execution Rating   
* **SA** \= Shot Accuracy Rating   
* **ST** \= Shot Technique Rating 

## 9.16.5 Outputs

The model stores:

* Shot Execution Rating   
* Confidence Score   
* Rating Variance   
* Historical Trend 

## 9.16.6 Relationship to Finishing Rating

The Shot Execution Rating provides one of the three Domain Ratings used to estimate the overall Finishing Rating.

# 9.17 Chance Conversion Rating

## 9.17.1 Purpose

The **Chance Conversion Rating** measures how effectively a team converts scoring opportunities into goals after accounting for chance quality.  
It combines overall finishing efficiency with clinical finishing in high-probability situations.

## 9.17.2 Component Ratings

The Chance Conversion Rating is estimated from:

* Finishing Efficiency Rating   
* Clinical Finishing Rating 

Together these ratings capture both long-term overperformance relative to xG and consistency in converting clear-cut opportunities.

## 9.17.3 Football Interpretation

Teams with high Chance Conversion Ratings consistently:

* Convert chances efficiently.   
* Score above expected goals over sustained periods.   
* Capitalise on clear scoring opportunities.   
* Produce repeatable finishing outcomes. 

## 9.17.4 Mathematical Definition

Conceptually,  
CC=fECF  
where:

* **CC** \= Chance Conversion Rating   
* **FE** \= Finishing Efficiency Rating   
* **CF** \= Clinical Finishing Rating 

## 9.17.5 Outputs

The model stores:

* Chance Conversion Rating   
* Confidence Score   
* Rating Variance   
* Historical Trend 

## 9.17.6 Relationship to Finishing Rating

The Chance Conversion Rating provides one of the three Domain Ratings used to estimate the overall Finishing Rating.

# 9.18 Finishing Composure Rating

## 9.18.1 Purpose

The **Finishing Composure Rating** measures a team's ability to execute successful finishes in high-pressure situations requiring decision-making and psychological control.

## 9.18.2 Component Ratings

The Finishing Composure Rating is estimated from:

* One-on-One Finishing Rating   
* Pressure Finishing Rating 

Together these ratings evaluate finishing performance when technical execution alone is insufficient.

## 9.18.3 Football Interpretation

Teams with high Finishing Composure Ratings consistently:

* Remain calm under pressure.   
* Finish effectively in one-on-one situations.   
* Convert contested opportunities.   
* Maintain finishing quality during decisive moments. 

## 9.18.4 Mathematical Definition

Conceptually,  
FC=fOPF  
where:

* **FC** \= Finishing Composure Rating   
* **OO** \= One-on-One Finishing Rating   
* **PF** \= Pressure Finishing Rating 

## 9.18.5 Outputs

The model stores:

* Finishing Composure Rating   
* Confidence Score   
* Rating Variance   
* Historical Trend 

## 9.18.6 Relationship to Finishing Rating

The Finishing Composure Rating provides one of the three Domain Ratings used to estimate the overall Finishing Rating.

# Part VI – Primary Rating

# 9.19 Finishing Rating Estimation

## 9.19.1 Purpose

The **Finishing Rating** represents the highest-level estimate of a team's underlying ability to convert scoring opportunities into goals.  
It combines the three Domain Ratings into a single latent measure of sustainable finishing performance.

## 9.19.2 Domain Ratings

The Finishing Rating is estimated from:

* Shot Execution Rating   
* Chance Conversion Rating   
* Finishing Composure Rating 

Each Domain Rating contributes unique information describing different aspects of finishing ability.

## 9.19.3 Mathematical Definition

Conceptually,  
FR=fCCFC  
where:

* **FR** \= Finishing Rating   
* **SE** \= Shot Execution Rating   
* **CC** \= Chance Conversion Rating   
* **FC** \= Finishing Composure Rating 

The estimation function is learned from historical match data using the GLPM modelling framework.

## 9.19.4 Football Interpretation

Teams with high Finishing Ratings consistently:

* Execute technically proficient shots.   
* Convert opportunities above expectation.   
* Remain composed in decisive moments.   
* Sustain positive finishing performance over time. 

Unlike raw goal totals, the Finishing Rating estimates the repeatable ability underlying successful chance conversion.

## 9.19.5 Outputs

The model stores:

* Finishing Rating   
* Confidence Interval   
* Rating Variance   
* Historical Trend   
* Reliability Score   
* Timestamp 

# 9.20 Relationship to the GLPM Framework

The Finishing Rating is one of the seven Primary Ratings within the Graham League Prediction Model.  
The hierarchy is:  
Raw Match Data  
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
Primary Ratings  
        │  
        ▼  
Expected Goals Engine  
        │  
        ▼  
Prediction Models  
Within this framework, the Finishing Rating complements the Attack Rating by measuring the ability to **convert** opportunities rather than **create** them.  
It also provides a natural counterpart to the Goalkeeper Rating:

* **Goalkeeper Rating** evaluates goals prevented relative to **Post-Shot Expected Goals (PSxG)**.   
* **Finishing Rating** evaluates goals scored relative to **Expected Goals (xG)**. 

Together, these ratings provide balanced estimates of offensive and defensive shot outcomes within GLPM.

# 9.21 Chapter Summary

This chapter introduced the **Finishing Rating**, the final Primary Rating within the Graham League Prediction Model.  
The chapter presented:

* The conceptual foundations of finishing evaluation.   
* The statistical role of **Goals − xG** as the primary indicator of finishing performance.   
* The data preparation and feature engineering pipeline.   
* Six specialised Component Ratings.   
* Three Domain Ratings.   
* The calibration methodology.   
* The hierarchical estimation of the overall Finishing Rating. 

The completed hierarchy is:  
Finishing Rating  
│  
├── Shot Execution Rating  
│   ├── Shot Accuracy Rating  
│   └── Shot Technique Rating  
│  
├── Chance Conversion Rating  
│   ├── Finishing Efficiency Rating  
│   └── Clinical Finishing Rating  
│  
└── Finishing Composure Rating  
    ├── One-on-One Finishing Rating  
    └── Pressure Finishing Rating  
The Finishing Rating completes the **Primary Rating layer** of GLPM and serves as the final offensive input into the Expected Goals Engine. Together with the Attack, Defence, Goalkeeper, Build-Up, Possession and Pressing Ratings, it forms a comprehensive representation of the fundamental football abilities used throughout the Graham League Prediction Model.