# Chapter 11 – Expected Goals Engine Integration

# Part I – Engine Overview

# 11.1 Purpose

## 11.1.1 Objective

The Expected Goals Engine is the central predictive component of the Graham League Prediction Model (GLPM). Its purpose is to transform the standardized representations of team strength produced by the GLPM Rating Framework into expected goals for both competing teams.  
While the preceding chapters focused on estimating latent football abilities through hierarchical rating models, the Expected Goals Engine converts those ratings into quantitative estimates of match performance. These expected goals form the statistical foundation for all subsequent prediction models, including match result probabilities, scoreline distributions, league simulations, and season forecasts.  
Accordingly, the Expected Goals Engine represents the transition from **rating estimation** to **predictive modelling** within the GLPM architecture.

## 11.1.2 Scope

The Expected Goals Engine is responsible for:

* receiving the Home and Away GLPM Rating Vectors;   
* incorporating relevant match-specific contextual information;   
* modelling the interaction between competing teams;   
* estimating expected goals for both teams; and   
* providing standardized outputs to the downstream prediction models. 

The engine is not responsible for estimating football abilities from historical data. Those responsibilities remain within the GLPM Rating Framework described in Chapters 3–10.

## 11.1.3 Position within the GLPM Architecture

The GLPM architecture separates the estimation of team ability from the prediction of football matches.  
The Rating Framework estimates the underlying football abilities of each team and produces a standardized Rating Vector. The Expected Goals Engine then converts those Rating Vectors into expected match performance.  
This separation ensures that improvements to the rating framework can be incorporated without requiring modifications to the prediction engine, while improvements to the prediction engine can likewise be implemented independently of the rating estimation process.

# 11.2 Design Philosophy

## 11.2.1 Reuse of a Validated Prediction Engine

Rather than developing a completely new expected goals model, GLPM integrates the Expected Goals Engine that was previously developed and validated as part of the World Cup Prediction Model.  
During the development of that project, the engine demonstrated strong predictive performance, reliable calibration, and consistent estimation of expected goals across a wide range of fixtures. As a result, it was adopted as the predictive core of GLPM.  
The principal innovation introduced by GLPM is therefore not a replacement of the prediction engine itself, but a substantial improvement in the representation of team strength supplied to that engine. The previous rating inputs have been replaced by the seven-dimensional GLPM Rating Vector, providing a richer and more comprehensive description of each team's underlying football ability.

## 11.2.2 Modular Architecture

The GLPM has been designed using a modular architecture in which rating estimation and match prediction are implemented as independent computational subsystems.  
The Rating Framework transforms historical match observations into calibrated estimates of latent football ability. The Expected Goals Engine then consumes these standardized estimates to predict future match performance.  
This separation provides several advantages:

* independent development of rating and prediction models;   
* simplified maintenance and validation;   
* improved computational scalability;   
* consistent interfaces between model components; and   
* flexibility for future methodological improvements. 

Because each subsystem performs a clearly defined role, modifications to one component do not require redesign of the remaining architecture.

## 11.2.3 Separation of Responsibilities

Within the GLPM framework, each computational layer performs a specific task.

| System Component | Primary Responsibility |
| ----- | ----- |
| Rating Framework | Estimate latent football abilities from historical data |
| GLPM Rating Vector | Standardize team strength into a common representation |
| Expected Goals Engine | Estimate Home and Away Expected Goals |
| Match Prediction Models | Estimate match outcome probabilities |
| League Simulation Models | Estimate season outcomes and league forecasts |

This hierarchical separation ensures that each stage of the framework remains interpretable, modular, and statistically coherent.

# 11.3 Expected Goals Engine Overview

## 11.3.1 Core Function

The Expected Goals Engine receives the Home and Away GLPM Rating Vectors together with relevant contextual match information.  
Rather than evaluating teams independently, the engine models football as the interaction between two competing teams. Offensive capabilities are evaluated against defensive capabilities, while transitional and possession-based strengths influence the overall balance of play.  
The result is an estimate of the expected number of goals that each team is likely to score under the conditions of the upcoming fixture.

## 11.3.2 Expected Goals Estimation

For every fixture, the engine produces two primary outputs:

* Home Expected Goals (xGH)   
* Away Expected Goals (xGA) 

These estimates represent the expected attacking production of each team after accounting for the interaction of both teams' football abilities and the relevant contextual factors associated with the fixture.  
The expected goals generated by the engine become the principal quantitative inputs for all subsequent prediction models.

## 11.3.3 Role Within the Prediction Framework

The Expected Goals Engine forms the central computational layer between team evaluation and probabilistic prediction.  
Its outputs are subsequently used to estimate:

* Match Result Probabilities;   
* Correct Score Probabilities;   
* Goal Totals;   
* Both Teams to Score Probabilities;   
* Team Goal Distributions;   
* League Simulations; and   
* Season Forecasts. 

The engine therefore acts as the mathematical bridge between latent football ability and observable football outcomes.

# 11.4 Engine Architecture

## 11.4.1 Computational Workflow

The computational workflow of the Expected Goals Engine is illustrated below.  
                 GLPM Rating Framework  
                         │  
                         ▼  
              Home Rating Vector  
              Away Rating Vector  
                         │  
                         ▼  
              Match Context Variables  
                         │  
                         ▼  
              Expected Goals Engine  
                         │  
        ┌────────────────┴────────────────┐  
        ▼                                 ▼  
 Home Expected Goals               Away Expected Goals  
        │                                 │  
        └────────────────┬────────────────┘  
                         ▼  
              Match Prediction Models  
                         │  
                         ▼  
             League Simulation Models  
The Expected Goals Engine occupies the central position within the prediction architecture, transforming standardized measures of team strength into expected match performance.

## 11.4.2 Inputs

The engine receives four categories of inputs:

* Home Team GLPM Rating Vector;   
* Away Team GLPM Rating Vector;   
* Match-specific contextual variables;   
* Competition-specific calibration parameters. 

Together, these inputs provide the information required to estimate expected goals for both competing teams.

## 11.4.3 Outputs

The Expected Goals Engine produces two principal outputs:

* Home Expected Goals (xGH)   
* Away Expected Goals (xGA) 

These expected goals are subsequently supplied to the higher-level prediction models responsible for estimating match probabilities and long-term league outcomes.  
The Expected Goals Engine therefore represents the final stage of deterministic modelling before the framework transitions into probabilistic prediction.

# Part I Summary

This part introduced the Expected Goals Engine as the predictive core of the Graham League Prediction Model. Unlike the preceding chapters, which focused on estimating latent football abilities, the Expected Goals Engine converts those abilities into quantitative estimates of expected match performance.  
GLPM adopts the validated Expected Goals Engine originally developed for the World Cup Prediction Model, integrating it within a modular architecture that separates rating estimation from prediction. The seven-dimensional GLPM Rating Vector provides a standardized representation of team strength, allowing the prediction engine to operate independently of the underlying rating methodology while benefiting from more comprehensive measures of football ability.  
The following part defines the complete set of inputs supplied to the Expected Goals Engine, beginning with the Home and Away GLPM Rating Vectors and the contextual information used to estimate expected goals.

# Part II – Inputs to the Expected Goals Engine

# 11.5 Home Team Rating Vector

## 11.5.1 Purpose

The Home Team GLPM Rating Vector provides the Expected Goals Engine with a standardized representation of the home team's underlying football ability.  
Rather than relying directly on historical match statistics, the engine receives the calibrated Primary Ratings produced by the GLPM Rating Framework. These ratings summarize the team's long-term performance across attacking, defensive, possession, and transitional phases of play.  
This standardized representation allows the prediction engine to evaluate every team using a common multidimensional framework.

## 11.5.2 Mathematical Representation

The Home Team Rating Vector is defined as  
RH=POHPRHFRH  
where

* AH— Attack Rating   
* DH— Defence Rating   
* GKH— Goalkeeper Rating   
* BUH— Build-Up Rating   
* POH— Possession Rating   
* PRH— Pressing Rating   
* FRH— Finishing Rating 

Each component represents a calibrated estimate of one latent football ability.

## 11.5.3 Football Interpretation

Collectively, the Home Rating Vector describes the expected playing profile of the home team.  
Rather than measuring isolated statistics, the vector captures complementary dimensions of football performance including chance creation, defensive organisation, ball progression, possession control, pressing effectiveness and finishing efficiency.

# 11.6 Away Team Rating Vector

## 11.6.1 Purpose

The Away Team Rating Vector provides an equivalent representation of the away team's football ability.  
The Expected Goals Engine simultaneously evaluates the Home and Away Rating Vectors, allowing predictions to depend upon the interaction between both teams rather than upon either team individually.

## 11.6.2 Mathematical Representation

The Away Team Rating Vector is defined as  
RA=POAPRAFRA  
using the same seven calibrated Primary Ratings.  
This common representation ensures consistency across all competitions and prediction tasks.

## 11.6.3 Comparative Framework

Because both teams are represented using identical rating structures, the Expected Goals Engine can compare corresponding football abilities directly.  
Examples include:

* Home Attack versus Away Defence.   
* Home Finishing versus Away Goalkeeper.   
* Home Build-Up versus Away Pressing.   
* Home Possession versus Away Pressing. 

These comparisons form the basis of the interaction modelling described in Part III.

# 11.7 Match Context Variables

## 11.7.1 Purpose

Although the Rating Vectors capture intrinsic team strength, football matches are influenced by additional contextual factors.  
The Expected Goals Engine therefore incorporates match-specific variables to account for systematic influences that are not represented directly within the rating framework.

## 11.7.2 Contextual Factors

Depending upon the competition and available data, these variables may include:

* Home advantage.   
* Competition effects.   
* Venue characteristics.   
* Fixture congestion.   
* Rest periods.   
* Travel requirements.   
* Other calibrated contextual adjustments. 

These variables influence expected match performance while preserving the integrity of the underlying team ratings.

## 11.7.3 Complete Engine Inputs

The complete information supplied to the Expected Goals Engine is illustrated below.  
             Home Rating Vector  
                     │  
                     │  
Away Rating Vector───┼──────────────┐  
                     │              │  
                     ▼              │  
           Match Context Variables  │  
                     │              │  
                     └──────┬───────┘  
                            ▼  
                Expected Goals Engine  
The engine therefore receives a complete representation of both competing teams together with the contextual information required to estimate expected goals.

## Part II Summary

Part II defined the standardized inputs to the Expected Goals Engine. Every fixture is represented by the Home and Away GLPM Rating Vectors together with relevant contextual variables describing the match environment.  
These inputs provide the complete information required for expected goals estimation.

# Part III – Expected Goals Estimation

# 11.8 Interaction Modelling

## 11.8.1 Philosophy

Football matches are not determined by the absolute quality of either team alone.  
Instead, match outcomes emerge from the interaction between the competing teams.  
Accordingly, the Expected Goals Engine evaluates offensive and defensive strengths simultaneously, allowing each team's expected performance to depend upon the qualities of its opponent.

## 11.8.2 Offensive–Defensive Relationships

The engine considers multiple complementary football interactions.  
These include:

| Offensive Ability | Defensive Counterpart |
| ----- | ----- |
| Attack | Defence |
| Finishing | Goalkeeper |
| Build-Up | Pressing |
| Possession | Pressing |

Each interaction contributes to the overall estimation of expected goals.  
Rather than relying on a single offensive or defensive metric, the engine evaluates football as a multidimensional competitive process.

# 11.9 Home Expected Goals Estimation

## 11.9.1 Objective

The Expected Goals Engine estimates the expected number of goals scored by the Home Team during the fixture.  
The estimate incorporates:

* Home Team football abilities.   
* Away Team football abilities.   
* Match context variables.   
* Home advantage adjustments.   
* Model calibration parameters. 

## 11.9.2 Conceptual Representation

Conceptually,  
xGH=fC  
where

* RHdenotes the Home Rating Vector,   
* RAdenotes the Away Rating Vector,   
* Crepresents contextual match variables. 

The function fis implemented by the validated Expected Goals Engine originally developed for the World Cup Prediction Model.

## 11.9.3 Football Interpretation

The estimated Home Expected Goals reflects the offensive opportunities expected to be generated by the Home Team after accounting for the quality of the opposing defence, goalkeeper, pressing system, and the broader match environment.

# 11.10 Away Expected Goals Estimation

## 11.10.1 Objective

The Expected Goals Engine simultaneously estimates the expected goals of the Away Team.  
The estimation follows the same methodology as the Home Team while accounting for differences in venue and contextual effects.

## 11.10.2 Conceptual Representation

xGA=fC  
where the Home and Away Rating Vectors exchange roles.  
This symmetry ensures that both competing teams are evaluated consistently.

## 11.10.3 Football Interpretation

The estimated Away Expected Goals reflects the attacking potential of the Away Team after accounting for the Home Team's defensive quality, goalkeeper performance, possession control, pressing ability, and contextual match effects.

# 11.11 Model Calibration

## 11.11.1 Purpose

The Expected Goals Engine incorporates calibration procedures to ensure that estimated expected goals remain statistically consistent with observed football outcomes.  
Calibration improves the reliability of predicted goal expectations across competitions, seasons, and varying levels of team quality.

## 11.11.2 Calibration Objectives

The calibration process seeks to ensure:

* unbiased expected goals estimates;   
* stable long-term predictive performance;   
* consistency across competitions;   
* robustness to temporal changes in football performance. 

## 11.11.3 Relationship to Prediction Models

The calibrated Home and Away Expected Goals become the principal quantitative inputs supplied to the prediction framework.  
These values are subsequently transformed into probability distributions describing possible match outcomes.

# 11.12 Expected Goals Outputs

The Expected Goals Engine produces two principal outputs:

* Home Expected Goals (xGH)   
* Away Expected Goals (xGA) 

These estimates summarize the expected attacking performance of both teams after considering the interaction of their GLPM Rating Vectors and the relevant contextual variables.  
They represent the final outputs of the Expected Goals Engine before the framework transitions from deterministic estimation to probabilistic prediction.

## Part III Summary

Part III described the methodology by which the Expected Goals Engine transforms standardized team representations into expected match performance. Rather than evaluating teams independently, the engine models football as an interaction between the Home and Away GLPM Rating Vectors, adjusted for contextual match effects.  
Using the validated Expected Goals Engine originally developed for the World Cup Prediction Model, the framework estimates Home and Away Expected Goals that serve as the primary quantitative inputs for all downstream prediction models. These expected goals provide the statistical bridge between latent football ability and probabilistic forecasting, preparing the foundation for **Chapter 12**, where they are converted into match outcome probabilities, scoreline distributions, and league predictions.

# Part IV – Expected Goals Engine Outputs

# 11.13 Expected Goals Outputs

## 11.13.1 Purpose

The primary objective of the Expected Goals Engine is to produce quantitative estimates of the expected number of goals that each competing team is likely to score during a fixture.  
Following the evaluation of the Home and Away Rating Vectors and the incorporation of contextual match variables, the engine produces two standardized outputs that represent the offensive expectations of both teams.  
These outputs provide the statistical foundation for every subsequent prediction generated by the Graham League Prediction Model.

## 11.13.2 Primary Outputs

For every fixture, the Expected Goals Engine estimates:

* Home Expected Goals (xGH)   
* Away Expected Goals (xGA) 

Together, these estimates represent the expected attacking production of the competing teams under the conditions of the scheduled match.  
Unlike observed goals, expected goals describe the average outcome that would be anticipated if the same fixture were played repeatedly under identical conditions.

## 11.13.3 Interpretation

The expected goals estimates should be interpreted as probabilistic expectations rather than deterministic predictions.  
For example,

* a team with an expected goals estimate of **2.1** is not predicted to score exactly two goals;   
* rather, it is expected to average approximately 2.1 goals across a large number of identical matches. 

Consequently, expected goals provide a stable measure of expected offensive performance that is less sensitive to the natural variability of football match outcomes.

# 11.14 Model Diagnostics

## 11.14.1 Purpose

In addition to expected goals, the prediction engine may generate diagnostic information describing the quality and consistency of the underlying model estimates.  
These diagnostics are intended for model evaluation and validation rather than end-user prediction.

## 11.14.2 Diagnostic Measures

Depending on the implementation, diagnostic outputs may include:

* prediction confidence measures;   
* calibration statistics;   
* residual analysis;   
* prediction error metrics;   
* model monitoring indicators. 

These measures support ongoing evaluation of predictive performance and facilitate future model refinement.

## 11.14.3 Quality Assurance

Model diagnostics are periodically reviewed to ensure that the Expected Goals Engine continues to produce reliable and well-calibrated estimates across different competitions and seasons.  
Where systematic deviations are identified, recalibration or retraining procedures may be undertaken to restore predictive performance.

# 11.15 Validation

## 11.15.1 Validation Philosophy

The Expected Goals Engine adopted within GLPM was not developed specifically for this framework.  
Instead, it originates from the prediction engine previously constructed for the World Cup Prediction Model, where it underwent extensive testing and refinement.  
The decision to retain this engine reflects its demonstrated predictive performance and statistical reliability.

## 11.15.2 Validation Objectives

The validation process seeks to verify that the engine:

* produces unbiased expected goals estimates;   
* remains well calibrated across competitions;   
* generalises to unseen fixtures;   
* provides consistent long-term predictive performance. 

## 11.15.3 Integration Validation

Following integration with the GLPM Rating Framework, additional validation is performed to ensure compatibility between the new Rating Vectors and the existing Expected Goals Engine.  
This validation confirms that replacing the previous rating inputs with the GLPM Rating Vector preserves or improves predictive performance while maintaining the stability of the prediction framework.

## Part IV Summary

Part IV described the outputs generated by the Expected Goals Engine and the procedures used to evaluate their quality. The engine produces standardized estimates of Home and Away Expected Goals that summarise the expected attacking performance of both competing teams. Supporting diagnostic measures and validation procedures ensure that these estimates remain statistically reliable and suitable for downstream probabilistic prediction.

# Part V – Integration with Prediction Models

# 11.16 Match Prediction Interface

## 11.16.1 Purpose

The Expected Goals Engine serves as the interface between team strength estimation and probabilistic match prediction.  
Rather than predicting football outcomes directly, the engine produces expected goals that are subsequently interpreted by the prediction models developed in Chapter 12\.  
This separation preserves the modular architecture of GLPM by distinguishing expected performance estimation from outcome probability estimation.

## 11.16.2 Prediction Pipeline

The prediction workflow is illustrated below.  
Home Rating Vector  
        │  
Away Rating Vector  
        │  
        ▼  
Expected Goals Engine  
        │  
        ▼  
Home xG      Away xG  
        │  
        ▼  
Probability Models  
        │  
        ▼  
Match Predictions  
The Expected Goals Engine therefore provides the principal quantitative inputs for every match prediction.

## 11.16.3 Prediction Products

The expected goals estimates generated by the engine are used to derive:

* Match Result Probabilities.   
* Correct Score Probabilities.   
* Goal Total Probabilities.   
* Both Teams to Score Probabilities.   
* Team Goal Distributions.   
* Additional probabilistic match forecasts. 

Each prediction model receives the expected goals estimates rather than the underlying GLPM Rating Vectors, ensuring that the Expected Goals Engine remains the single interface between rating estimation and probabilistic prediction.

# 11.17 League Prediction Interface

## 11.17.1 Season Simulation

Match-level predictions generated from the Expected Goals Engine provide the inputs required for league simulation models.  
Individual fixture predictions are aggregated across an entire competition to estimate season outcomes.

## 11.17.2 League Forecasts

Using repeated simulation of scheduled fixtures, the GLPM estimates:

* Final league positions.   
* Expected points totals.   
* Championship probabilities.   
* Qualification probabilities.   
* Relegation probabilities.   
* Other season-level forecasting metrics. 

Thus, league predictions are ultimately derived from the expected goals estimated for every fixture.

## 11.17.3 Hierarchical Prediction Framework

The complete prediction hierarchy is summarised below.  
                 GLPM Rating Framework  
                         │  
                         ▼  
                  GLPM Rating Vector  
                         │  
                         ▼  
              Expected Goals Engine  
                         │  
          ┌──────────────┴──────────────┐  
          ▼                             ▼  
     Home Expected Goals         Away Expected Goals  
                    │  
                    ▼  
          Match Prediction Models  
                    │  
                    ▼  
         League Simulation Models  
                    │  
                    ▼  
           Season Forecast Outputs  
This hierarchy demonstrates how expected goals serve as the common quantitative foundation for every prediction produced by GLPM.

# 11.18 Chapter Summary

This chapter described the integration of the Expected Goals Engine within the Graham League Prediction Model.  
Unlike the preceding chapters, which focused on estimating latent football abilities, this chapter demonstrated how those abilities are transformed into expected match performance.  
The chapter established:

* the role of the Expected Goals Engine within the GLPM architecture;   
* the rationale for retaining the validated engine originally developed for the World Cup Prediction Model;   
* the standardized Home and Away GLPM Rating Vectors supplied as inputs;   
* the interaction modelling used to estimate Home and Away Expected Goals;   
* the outputs produced by the engine;   
* and the integration of those outputs with the match prediction and league simulation models. 

The complete workflow can be summarised as follows.  
Historical Match Data  
          │  
          ▼  
 GLPM Rating Framework  
          │  
          ▼  
 GLPM Rating Vector  
          │  
          ▼  
 Expected Goals Engine  
          │  
    ┌─────┴─────┐  
    ▼           ▼  
 Home xG    Away xG  
    │           │  
    └─────┬─────┘  
          ▼  
 Match Prediction Models  
          │  
          ▼  
 League Simulation Models  
          │  
          ▼  
 Season Forecasts  
The Expected Goals Engine represents the computational bridge between the estimation of team strength and the prediction of football outcomes. By combining the multidimensional GLPM Rating Vectors with contextual match information, the engine produces calibrated expected goals that underpin every probabilistic forecast generated by the framework.  
With the integration of the Expected Goals Engine complete, the manual now transitions from deterministic performance estimation to probabilistic forecasting.
