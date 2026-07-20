# Chapter 10 – GLPM Rating System Architecture

# Part I – Framework Overview

# 10.1 Purpose

## 10.1.1 Objective

The **GLPM Rating System Architecture** defines how the individual rating models developed throughout Chapters 3–9 operate as a unified statistical framework.  
While each Primary Rating estimates a distinct football ability, accurate match prediction requires these ratings to interact within a common hierarchical architecture. This chapter describes how those interactions occur and how the complete rating system forms the foundation of the Graham League Prediction Model (GLPM).  
Rather than introducing additional football ratings, this chapter documents the architecture that links the rating estimation framework to the Expected Goals Engine and the downstream prediction models.

## 10.1.2 Scope

The GLPM Rating System Architecture describes:

* The hierarchical organisation of the rating framework.   
* The relationship between Component, Domain and Primary Ratings.   
* The interaction between the seven Primary Ratings.   
* The construction of the GLPM Rating Vector.   
* The integration of the rating system into the Expected Goals Engine.   
* The transition from rating estimation to predictive modelling. 

This chapter therefore acts as the bridge between the statistical rating models and the prediction framework described in later chapters.

## 10.1.3 Objectives of the Architecture

The architecture has been designed to satisfy several objectives.  
It aims to:

* Represent football performance through interpretable latent abilities.   
* Separate different aspects of team performance into specialised rating models.   
* Maintain statistical consistency across all ratings.   
* Reduce redundancy between correlated football variables.   
* Produce modular machine learning models.   
* Allow individual rating models to evolve independently.   
* Provide a common input representation for downstream prediction models. 

These principles ensure that GLPM remains both statistically robust and computationally scalable.

# 10.2 Overall Architecture

## 10.2.1 Hierarchical Framework

The GLPM is organised as a hierarchical statistical framework.  
Rather than estimating match outcomes directly from raw match statistics, information passes through several increasingly abstract modelling stages.  
Each stage extracts progressively richer representations of underlying football ability.  
The complete architecture is illustrated below.  
                    GRAHAM LEAGUE PREDICTION MODEL (GLPM)

┌─────────────────────────────────────────────────────────────────────────────┐  
│                         Historical Match Data                              │  
└─────────────────────────────────────────────────────────────────────────────┘  
                                      │  
                                      ▼  
┌─────────────────────────────────────────────────────────────────────────────┐  
│                      Raw Match Observations                                │  
│                                                                             │  
│ • Event Data            • Tracking Data          • Match Statistics         │  
│ • Shot Data             • Possession Data        • Tactical Information     │  
└─────────────────────────────────────────────────────────────────────────────┘  
                                      │  
                                      ▼  
┌─────────────────────────────────────────────────────────────────────────────┐  
│                   Data Cleaning & Validation                               │  
└─────────────────────────────────────────────────────────────────────────────┘  
                                      │  
                                      ▼  
┌─────────────────────────────────────────────────────────────────────────────┐  
│                      Feature Engineering                                   │  
└─────────────────────────────────────────────────────────────────────────────┘  
                                      │  
                                      ▼  
┌─────────────────────────────────────────────────────────────────────────────┐  
│                 Context & Opposition Adjustment                            │  
└─────────────────────────────────────────────────────────────────────────────┘  
                                      │  
                                      ▼  
═══════════════════════════════════════════════════════════════════════════════  
                          COMPONENT RATING MODELS  
═══════════════════════════════════════════════════════════════════════════════  
                                      │  
                                      ▼  
═══════════════════════════════════════════════════════════════════════════════  
                             DOMAIN RATINGS  
═══════════════════════════════════════════════════════════════════════════════  
                                      │  
                                      ▼  
═══════════════════════════════════════════════════════════════════════════════  
                             PRIMARY RATINGS  
═══════════════════════════════════════════════════════════════════════════════

      Attack      Defence      Goalkeeper      Build-Up  
          │             │             │              │  
          └─────────────┼─────────────┼──────────────┘  
                        │  
     Possession      Pressing      Finishing  
            │              │             │  
            └──────────────┼─────────────┘  
                           │  
                           ▼  
═══════════════════════════════════════════════════════════════════════════════  
                         GLPM RATING VECTOR  
═══════════════════════════════════════════════════════════════════════════════  
                           │  
                           ▼  
═══════════════════════════════════════════════════════════════════════════════  
                      EXPECTED GOALS ENGINE  
═══════════════════════════════════════════════════════════════════════════════  
                           │  
                           ▼  
═══════════════════════════════════════════════════════════════════════════════  
                     MATCH PREDICTION MODELS  
═══════════════════════════════════════════════════════════════════════════════  
                           │  
                           ▼  
═══════════════════════════════════════════════════════════════════════════════  
                     LEAGUE PREDICTIONS  
═══════════════════════════════════════════════════════════════════════════════  
The architecture separates the estimation of football ability from the prediction of football outcomes, ensuring that each modelling stage performs a clearly defined statistical function.

## 10.2.2 Layered Design

The architecture consists of six modelling layers.

| Layer | Purpose |
| ----- | ----- |
| Raw Data | Historical football observations |
| Engineered Features | Derived statistical variables |
| Component Ratings | Individual football abilities |
| Domain Ratings | Broader football capabilities |
| Primary Ratings | Overall football performance dimensions |
| Prediction Models | Match and league outcome estimation |

Each layer consumes the outputs of the preceding layer while producing increasingly informative representations for the next stage.

## 10.2.3 Separation of Responsibilities

Each architectural layer performs a unique role.

* **Raw Data** records observed football events.   
* **Feature Engineering** extracts informative statistical variables.   
* **Component Ratings** estimate specialised football abilities.   
* **Domain Ratings** aggregate related abilities into broader capabilities.   
* **Primary Ratings** represent the principal dimensions of team strength.   
* **Prediction Models** estimate future football outcomes. 

This separation reduces model complexity while improving interpretability.

# 10.3 Hierarchical Design Philosophy

## 10.3.1 Latent Football Ability

A central assumption of GLPM is that football ability cannot be measured directly.  
Observed statistics such as goals, possession or passes are influenced by numerous contextual factors and therefore provide only indirect evidence of underlying team quality.  
GLPM instead estimates **latent football abilities** that generate these observed outcomes.  
Each rating is therefore interpreted as an estimate of an underlying capability rather than a descriptive statistic.

## 10.3.2 Hierarchical Estimation

The architecture estimates football ability through multiple levels of abstraction.  
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
 Primary Ratings  
          │  
          ▼  
 GLPM Rating Vector  
Each level reduces statistical noise while increasing the interpretability of the estimated abilities.

## 10.3.3 Modular Architecture

Each Primary Rating is developed independently using its own:

* Data Pipeline   
* Component Ratings   
* Domain Ratings   
* Calibration Process 

Because every rating follows the same hierarchical methodology, improvements to one rating model can be implemented without requiring changes to the remaining rating models.  
This modular design simplifies future development and maintenance of the GLPM.

## 10.3.4 Consistency Across Ratings

One of the defining characteristics of GLPM is that every Primary Rating follows the same statistical framework.  
Each rating is estimated using:

* Historical Match Data   
* Feature Engineering   
* Six Component Ratings   
* Three Domain Ratings   
* One Primary Rating 

This consistency ensures that all seven ratings are directly comparable and integrate seamlessly into the broader prediction framework.

# 10.4 Relationship Between Ratings

## 10.4.1 Complementary Football Abilities

Each Primary Rating represents a distinct dimension of football performance.  
Rather than measuring the same behaviour repeatedly, the ratings collectively describe complementary aspects of team quality.  
The seven Primary Ratings are:

| Primary Rating | Primary Football Ability |
| ----- | ----- |
| Attack Rating | Creating scoring opportunities |
| Defence Rating | Preventing opposition attacks |
| Goalkeeper Rating | Preventing goals through goalkeeping actions |
| Build-Up Rating | Progressing possession from defensive areas |
| Possession Rating | Controlling possession and territory |
| Pressing Rating | Regaining possession and disrupting opponents |
| Finishing Rating | Converting scoring opportunities into goals |

Together these ratings provide a comprehensive representation of a team's underlying football ability.

## 10.4.2 Interaction Between Ratings

Although each rating is estimated independently, football performance emerges through the interaction of multiple abilities.  
For example:

* Effective Build-Up improves attacking opportunities.   
* Strong Pressing increases possession recoveries.   
* High Possession supports sustained attacking pressure.   
* Good Finishing converts created chances into goals.   
* Strong Defence reduces opposition chance creation.   
* Goalkeeper performance influences goals conceded independently of defensive quality. 

Accordingly, GLPM treats the seven Primary Ratings as complementary components of a unified predictive system rather than isolated performance measures.

## 10.4.3 Transition to the Rating Vector

Once the seven Primary Ratings have been estimated, they are combined into a single numerical representation of team strength.

This representation, known as the **GLPM Rating Vector**, provides the standardized input consumed by the Expected Goals Engine and the downstream prediction models.  
The construction and mathematical definition of the GLPM Rating Vector are presented in Part IV of this chapter.

# Part II – Rating Hierarchy

# 10.5 Raw Match Data

## 10.5.1 Purpose

The foundation of the Graham League Prediction Model is historical football match data.  
Every rating estimated within GLPM ultimately originates from observed football events collected during competitive matches. These observations provide the empirical evidence used to estimate the latent football abilities described throughout Chapters 3–9.  
Raw match data therefore represents the lowest layer of the GLPM hierarchy.

## 10.5.2 Data Sources

The architecture incorporates multiple complementary sources of football information.  
Typical sources include:

* Event Data   
* Match Statistics   
* Tracking Data   
* Shot Data   
* Possession Data   
* Tactical Event Data   
* Goalkeeper Event Data   
* Set Piece Data 

Combining multiple data sources allows GLPM to capture both observable outcomes and the processes that generate them.

## 10.5.3 Characteristics of Raw Data

Raw observations are descriptive rather than predictive.  
Examples include:

* Passes   
* Tackles   
* Interceptions   
* Pressures   
* Possession Sequences   
* Shots   
* Goals   
* Expected Goals   
* Saves   
* Crosses   
* Fouls 

These variables describe football events but do not directly measure underlying team ability.

## 10.5.4 Position Within the Hierarchy

Historical Match Data  
        │  
        ▼  
Raw Match Observations  
This layer provides the statistical foundation upon which all subsequent modelling stages are built.

# 10.6 Engineered Features

## 10.6.1 Purpose

Raw observations contain substantial contextual noise and cannot be used directly to estimate latent football abilities.  
Feature engineering transforms these observations into statistically informative variables that more accurately represent repeatable football behaviours.

## 10.6.2 Feature Construction

Representative engineered features include:

* Progressive Passing Rate   
* Goals − Expected Goals   
* Post-Shot Expected Goals Prevented   
* Press Success Percentage   
* Build-Up Progression Index   
* Ball Retention Rate   
* Defensive Compactness Index   
* Shot Accuracy Percentage   
* Recovery Efficiency   
* Possession Tempo 

Each feature captures information that is more predictive than the underlying raw observations.

## 10.6.3 Context Adjustment

Before feature estimation, observations are adjusted for:

* Opposition Strength   
* Competition Quality   
* Match State   
* Home Advantage   
* Tactical Style   
* Fixture Congestion   
* Weather   
* Rest Days 

These adjustments improve comparability across teams and competitions.

## 10.6.4 Position Within the Hierarchy

Raw Match Data  
      │  
      ▼  
Feature Engineering  
      │  
      ▼  
Adjusted Features  
These adjusted features provide the direct inputs to the Component Rating models.

# 10.7 Component Ratings

## 10.7.1 Purpose

Component Ratings represent the first level of latent football ability within GLPM.  
Each Component Rating estimates a specialised football skill using engineered statistical features.  
Component Ratings are intentionally narrow in scope, allowing the model to isolate individual football abilities before aggregation.

## 10.7.2 Component Rating Structure

Every Primary Rating contains exactly six Component Ratings.  
Across the seven Primary Ratings, GLPM therefore estimates:  
7×6=42  
Component Ratings.  
These represent the most detailed football abilities modelled within the framework.

## 10.7.3 Examples

Examples include:  
Attack

* Goal Threat Rating   
* Creativity Rating 

Defence

* Defensive Positioning Rating   
* Defensive Discipline Rating 

Goalkeeper

* Shot Stopping Rating   
* Sweeper Rating 

Build-Up

* Progressive Passing Rating   
* Press Resistance Rating 

Possession

* Ball Circulation Rating   
* Space Control Rating 

Pressing

* Counter-Press Rating   
* Press Success Rating 

Finishing

* Shot Accuracy Rating   
* Clinical Finishing Rating 

## 10.7.4 Position Within the Hierarchy

Adjusted Features  
        │  
        ▼  
Component Ratings  
Component Ratings provide the building blocks for the Domain Ratings.

# 10.8 Domain Ratings

## 10.8.1 Purpose

Domain Ratings aggregate closely related Component Ratings into broader football capabilities.  
They provide an intermediate level of abstraction between specialised football skills and the overall Primary Ratings.  
This aggregation reduces statistical noise while improving interpretability.

## 10.8.2 Domain Rating Structure

Each Primary Rating contains three Domain Ratings.  
Across GLPM, the architecture therefore estimates:  
7×3=21  
Domain Ratings.  
Each Domain Rating combines two related Component Ratings.

## 10.8.3 Examples

Examples include:  
Attack

* Chance Creation Rating   
* Attacking Threat Rating   
* Attacking Support Rating 

Defence

* Defensive Organisation Rating   
* Defensive Actions Rating   
* Defensive Stability Rating 

Goalkeeper

* Goal Prevention Rating   
* Distribution & Build-Up Rating   
* Area Command Rating 

Build-Up

* Build-Up Progression Rating   
* Build-Up Security Rating   
* Build-Up Structure Rating 

Possession

* Ball Retention Rating   
* Territorial Control Rating   
* Possession Control Rating 

Pressing

* Press Intensity Rating   
* Ball Recovery Rating   
* Press Effectiveness Rating 

Finishing

* Shot Execution Rating   
* Chance Conversion Rating   
* Finishing Composure Rating 

## 10.8.4 Position Within the Hierarchy

Component Ratings  
        │  
        ▼  
 Domain Ratings  
Domain Ratings summarise broader football capabilities before estimating the Primary Ratings.

# 10.9 Primary Ratings

## 10.9.1 Purpose

Primary Ratings represent the highest level of football ability estimated directly by GLPM.  
Each Primary Rating summarises a major dimension of team performance by combining three Domain Ratings into a single latent estimate.  
These ratings form the principal outputs of the rating estimation framework.

## 10.9.2 Primary Rating Structure

GLPM estimates seven Primary Ratings.  
These are:

* Attack Rating   
* Defence Rating   
* Goalkeeper Rating   
* Build-Up Rating   
* Possession Rating   
* Pressing Rating   
* Finishing Rating 

Together they provide a comprehensive statistical representation of team quality.

## 10.9.3 Hierarchical Summary

The complete hierarchy can be expressed as:  
Raw Match Data  
        │  
        ▼  
Engineered Features  
        │  
        ▼  
42 Component Ratings  
        │  
        ▼  
21 Domain Ratings  
        │  
        ▼  
7 Primary Ratings  
This layered structure progressively transforms raw football observations into increasingly abstract representations of team ability.

## 10.9.4 Relationship to the Expected Goals Engine

The seven Primary Ratings are not the final outputs of GLPM.  
Instead, they are combined into the **GLPM Rating Vector**, which serves as the standardized input to the Expected Goals Engine described in Chapter 11\.  
The Expected Goals Engine then transforms these latent football abilities into probabilistic estimates of match performance.

## Chapter Hierarchy Summary

The complete rating hierarchy is illustrated below.  
                               Historical Match Data  
                                        │  
                                        ▼  
                             Raw Match Observations  
                                        │  
                                        ▼  
                          Data Cleaning & Validation  
                                        │  
                                        ▼  
                            Feature Engineering  
                                        │  
                                        ▼  
                     Context & Opposition Adjustment  
                                        │  
                                        ▼  
═══════════════════════════════════════════════════════════════════════  
                          42 COMPONENT RATINGS  
═══════════════════════════════════════════════════════════════════════  
                                        │  
                                        ▼  
═══════════════════════════════════════════════════════════════════════  
                            21 DOMAIN RATINGS  
═══════════════════════════════════════════════════════════════════════  
                                        │  
                                        ▼  
═══════════════════════════════════════════════════════════════════════  
                             7 PRIMARY RATINGS  
═══════════════════════════════════════════════════════════════════════  
                                        │  
                                        ▼  
                           GLPM RATING VECTOR  
                                        │  
                                        ▼  
                          EXPECTED GOALS ENGINE

# Chapter 10 – GLPM Rating System Architecture

# Part III – Primary Rating Interactions

# 10.10 Attack & Finishing

## 10.10.1 Distinct Offensive Functions

Although both the Attack Rating and the Finishing Rating contribute to offensive performance, they measure fundamentally different football abilities.  
The **Attack Rating** estimates a team's ability to create scoring opportunities.  
The **Finishing Rating** estimates a team's ability to convert those opportunities into goals.  
This separation reflects one of the core design principles of GLPM: **chance creation and chance conversion are independent latent abilities**.

## 10.10.2 Separation of Creation and Conversion

Many traditional football metrics combine attacking production and finishing efficiency into a single measure.  
For example:

* Goals Scored   
* Goals per Match   
* Shot Conversion Rate 

These statistics fail to distinguish between:

* creating many chances but finishing poorly, and   
* creating few chances but finishing exceptionally well. 

GLPM separates these processes into two independent Primary Ratings.  
Conceptually,  
Goals\=f Finishing Rating  
where the Attack Rating determines the quantity and quality of opportunities, while the Finishing Rating determines the probability that those opportunities become goals.

## 10.10.3 Football Interpretation

A team may exhibit:

* High Attack \+ Low Finishing   
* Low Attack \+ High Finishing   
* High Attack \+ High Finishing   
* Low Attack \+ Low Finishing 

These combinations produce very different offensive profiles despite potentially similar goal totals.  
The separation therefore improves both interpretability and predictive performance.

# 10.11 Defence & Goalkeeper

## 10.11.1 Defensive Responsibilities

GLPM similarly separates defending into two complementary abilities.  
The **Defence Rating** measures the team's ability to prevent dangerous attacking situations.  
The **Goalkeeper Rating** measures the goalkeeper's ability to prevent goals once shots have been conceded.

## 10.11.2 Separation of Prevention Stages

Defending occurs in multiple stages.  
The first stage aims to prevent shots.  
The second stage aims to prevent goals after shots occur.  
GLPM therefore models  
Opposition Attack  
        │  
        ▼  
 Defensive Organisation  
        │  
        ▼  
 Shot Prevention  
        │  
        ▼  
If Shot Occurs  
        │  
        ▼  
 Goalkeeper Intervention  
        │  
        ▼  
 Goal Prevention  
This decomposition recognises that excellent goalkeeping cannot fully compensate for consistently poor defending, and strong defending cannot eliminate every shot on target.

## 10.11.3 Relationship to Expected Goals

This separation is also reflected in the statistical foundations of the ratings.  
The Defence Rating primarily influences:

* Opposition shot volume   
* Opposition shot quality   
* Expected Goals Against (xGA) 

The Goalkeeper Rating primarily influences:

* Post-Shot Expected Goals Prevented (PSxG Prevented)   
* Save Probability   
* Goals Prevented 

Together these ratings estimate the complete defensive process from chance prevention to shot stopping.

# 10.12 Build-Up, Possession & Pressing

## 10.12.1 Midfield Control

The remaining three Primary Ratings describe how teams control possession throughout a match.  
Although related, each rating estimates a distinct stage of possession.

## 10.12.2 Functional Roles

### Build-Up Rating

Measures progression from defensive areas into advanced attacking positions.  
Primary focus:

* Ball progression   
* Press resistance   
* Progressive passing   
* Build-up structure 

### Possession Rating

Measures sustained control of the ball after possession has been established.  
Primary focus:

* Ball retention   
* Circulation   
* Territorial control   
* Tempo management 

### Pressing Rating

Measures a team's ability to regain possession after losing it.  
Primary focus:

* Press intensity   
* Counter-pressing   
* Ball recovery   
* Press effectiveness 

## 10.12.3 Continuous Possession Cycle

These ratings can be viewed as different phases of the same football process.  
Possession Won  
       │  
       ▼  
Build-Up  
       │  
       ▼  
Possession Control  
       │  
       ▼  
Attacking Phase  
       │  
       ▼  
Possession Lost  
       │  
       ▼  
Pressing  
       │  
       ▼  
Possession Regained  
       │  
       └───────────────┐  
                       ▼  
                  Build-Up  
This cycle demonstrates how Build-Up, Possession and Pressing collectively govern a team's ability to control matches.

# 10.13 Cross-Rating Dependencies

## 10.13.1 Independent Estimation

Each Primary Rating is estimated using its own dedicated statistical model.  
Consequently, improvements in one rating model do not require retraining the remaining rating models.  
This modularity is a defining characteristic of the GLPM architecture.

## 10.13.2 Football Dependencies

Although statistically independent during estimation, the ratings interact naturally during football matches.  
Examples include:

| Primary Rating | Influences |
| ----- | ----- |
| Build-Up | Attack, Possession |
| Possession | Attack, Pressing |
| Pressing | Defence, Attack |
| Attack | Finishing |
| Defence | Goalkeeper |
| Goalkeeper | Defensive Stability |

These interactions emerge through football itself rather than through direct statistical dependence between rating models.

## 10.13.3 System-Level Integration

The seven Primary Ratings collectively describe a team's overall football capability.  
Rather than operating independently, they interact through the Expected Goals Engine, where offensive, defensive and transitional strengths are combined to estimate match outcomes.  
The architecture therefore separates **rating estimation** from **rating utilisation**:  
              RATING ESTIMATION  
──────────────────────────────────────────────

Attack Rating  
Defence Rating  
Goalkeeper Rating  
Build-Up Rating  
Possession Rating  
Pressing Rating  
Finishing Rating

                │  
                ▼

        GLPM Rating Vector

──────────────────────────────────────────────  
            PREDICTIVE MODELLING  
──────────────────────────────────────────────

Expected Goals Engine  
        │  
        ▼  
Match Outcome Models  
        │  
        ▼  
League Prediction Models  
The Primary Ratings remain independent statistical estimates, but their combined representation enables GLPM to model the interconnected nature of football performance.

# Chapter 10 – GLPM Rating System Architecture

# Part IV – Integration with the Expected Goals Engine

# 10.14 GLPM Rating Vector

## 10.14.1 Purpose

Once the seven Primary Ratings have been estimated, they are combined into a single mathematical representation known as the **GLPM Rating Vector**.  
The Rating Vector provides a standardized description of a team's underlying football ability and serves as the principal input to the Expected Goals Engine.  
Rather than treating the Primary Ratings as separate variables throughout the modelling framework, GLPM represents each team using one unified vector of latent football abilities.

## 10.14.2 Mathematical Definition

For a given team, the GLPM Rating Vector is defined as  
R=  BU  PO  PR  FR  
where

* A\= Attack Rating   
* D\= Defence Rating   
* GK\= Goalkeeper Rating   
* BU\= Build-Up Rating   
* PO\= Possession Rating   
* PR\= Pressing Rating   
* FR\= Finishing Rating 

Each element represents a calibrated estimate of one fundamental football ability.

## 10.14.3 Interpretation

The Rating Vector provides a complete statistical profile of a team's football performance.  
Instead of relying on hundreds of engineered variables during prediction, GLPM compresses those variables into seven interpretable latent dimensions.  
Consequently,

* every team is represented consistently,   
* every prediction model receives the same standardized input,   
* and the prediction framework remains independent of the underlying rating estimation process. 

## 10.14.4 Rating Vector Hierarchy

Historical Match Data  
          │  
          ▼  
 Engineered Features  
          │  
          ▼  
42 Component Ratings  
          │  
          ▼  
21 Domain Ratings  
          │  
          ▼  
 7 Primary Ratings  
          │  
          ▼  
 GLPM Rating Vector  
The Rating Vector therefore represents the final output of the rating estimation framework.

# 10.15 Rating Aggregation

## 10.15.1 From Individual Ratings to Team Representation

Although each Primary Rating estimates a separate football ability, prediction models require a single representation of team strength.  
The Rating Vector performs this aggregation without discarding information.  
Rather than averaging the ratings, GLPM preserves every dimension independently within the vector.

## 10.15.2 Preservation of Information

Unlike composite scoring systems, the Rating Vector retains the individual contribution of every Primary Rating.  
For example,  
Team A

Attack       88  
Defence      81  
Goalkeeper   79  
Build-Up     85  
Possession   84  
Pressing     80  
Finishing    90  
is fundamentally different from  
Team B

Attack       84  
Defence      88  
Goalkeeper   82  
Build-Up     79  
Possession   90  
Pressing     84  
Finishing    80  
Even if two teams possess similar overall quality, differences in the composition of their Rating Vectors produce different predicted match behaviours.

## 10.15.3 Advantages of Vector Representation

Representing teams as vectors provides several advantages.  
It:

* preserves multidimensional information,   
* avoids unnecessary aggregation,   
* improves model interpretability,   
* supports flexible machine learning models,   
* enables future expansion of the rating framework. 

The Rating Vector therefore serves as the canonical representation of team strength throughout GLPM.

# 10.16 Expected Goals Inputs

## 10.16.1 From Ratings to Match Simulation

The Expected Goals Engine receives the Rating Vectors of both competing teams.  
For a match between the Home Team and Away Team,  
RH and RA  
form the principal inputs to the prediction process.

## 10.16.2 Interaction Between Teams

Rather than evaluating teams independently, GLPM compares the Rating Vectors of both opponents simultaneously.  
This allows the model to estimate interactions such as:

* Home Attack versus Away Defence.   
* Home Build-Up versus Away Pressing.   
* Home Finishing versus Away Goalkeeper.   
* Home Possession versus Away Pressing.   
* Away Attack versus Home Defence.   
* Away Finishing versus Home Goalkeeper. 

These interactions provide a richer description of expected match dynamics than isolated team statistics.

## 10.16.3 Conceptual Interaction Matrix

                 HOME TEAM

 Attack        ─────────────┐  
 Defence                    │  
 Goalkeeper                 │  
 Build-Up                   │  
 Possession                 │  
 Pressing                   │  
 Finishing                  │  
                            ▼  
                    Expected Goals Engine  
                            ▲  
 Attack                    │  
 Defence                   │  
 Goalkeeper                │  
 Build-Up                  │  
 Possession                │  
 Pressing                  │  
 Finishing                 │

                 AWAY TEAM  
The Expected Goals Engine evaluates the interaction between both Rating Vectors to estimate offensive and defensive performance for each team.

# 10.17 Model Outputs

## 10.17.1 Expected Goals Estimation

Using the Home and Away Rating Vectors, the Expected Goals Engine estimates

* Home Expected Goals   
* Away Expected Goals 

These estimates represent the expected attacking output of each team after considering the interaction of all seven Primary Ratings.

## 10.17.2 Downstream Prediction Models

The Expected Goals estimates are subsequently supplied to higher-level prediction models responsible for estimating:

* Match Result Probabilities   
* Correct Score Probabilities   
* Goal Totals   
* Both Teams to Score   
* Team Goal Distributions   
* League Points   
* Season Standings 

Thus, the Expected Goals Engine forms the bridge between latent football ability and observable football outcomes.

## 10.17.3 Complete Prediction Architecture

The complete GLPM architecture can now be represented as follows.  
                        Historical Match Data  
                                  │  
                                  ▼  
                         Feature Engineering  
                                  │  
                                  ▼  
                       42 Component Ratings  
                                  │  
                                  ▼  
                        21 Domain Ratings  
                                  │  
                                  ▼  
                         7 Primary Ratings  
                                  │  
                                  ▼  
                          GLPM Rating Vector  
                    ┌──────────────┴──────────────┐  
                    │                             │  
                    ▼                             ▼  
             Home Team Vector              Away Team Vector  
                    │                             │  
                    └──────────────┬──────────────┘  
                                   ▼  
                        Expected Goals Engine  
                                   │  
                                   ▼  
                     Home xG               Away xG  
                                   │  
                                   ▼  
                      Match Prediction Models  
                                   │  
                                   ▼  
                         League Prediction Models

# Chapter 10 – GLPM Rating System Architecture

# Part IV – Integration with the Expected Goals Engine

# 10.14 GLPM Rating Vector

## 10.14.1 Purpose

Once the seven Primary Ratings have been estimated, they are combined into a single mathematical representation known as the **GLPM Rating Vector**.  
The Rating Vector provides a standardized description of a team's underlying football ability and serves as the principal input to the Expected Goals Engine.  
Rather than treating the Primary Ratings as separate variables throughout the modelling framework, GLPM represents each team using one unified vector of latent football abilities.

## 10.14.2 Mathematical Definition

For a given team, the GLPM Rating Vector is defined as  
R=  BU  PO  PR  FR  
where

* A\= Attack Rating   
* D\= Defence Rating   
* GK\= Goalkeeper Rating   
* BU\= Build-Up Rating   
* PO\= Possession Rating   
* PR\= Pressing Rating   
* FR\= Finishing Rating 

Each element represents a calibrated estimate of one fundamental football ability.

## 10.14.3 Interpretation

The Rating Vector provides a complete statistical profile of a team's football performance.  
Instead of relying on hundreds of engineered variables during prediction, GLPM compresses those variables into seven interpretable latent dimensions.  
Consequently,

* every team is represented consistently,   
* every prediction model receives the same standardized input,   
* and the prediction framework remains independent of the underlying rating estimation process. 

## 10.14.4 Rating Vector Hierarchy

Historical Match Data  
          │  
          ▼  
 Engineered Features  
          │  
          ▼  
42 Component Ratings  
          │  
          ▼  
21 Domain Ratings  
          │  
          ▼  
 7 Primary Ratings  
          │  
          ▼  
 GLPM Rating Vector  
The Rating Vector therefore represents the final output of the rating estimation framework.

# 10.15 Rating Aggregation

## 10.15.1 From Individual Ratings to Team Representation

Although each Primary Rating estimates a separate football ability, prediction models require a single representation of team strength.  
The Rating Vector performs this aggregation without discarding information.  
Rather than averaging the ratings, GLPM preserves every dimension independently within the vector.

## 10.15.2 Preservation of Information

Unlike composite scoring systems, the Rating Vector retains the individual contribution of every Primary Rating.  
For example,  
Team A

Attack       88  
Defence      81  
Goalkeeper   79  
Build-Up     85  
Possession   84  
Pressing     80  
Finishing    90  
is fundamentally different from  
Team B

Attack       84  
Defence      88  
Goalkeeper   82  
Build-Up     79  
Possession   90  
Pressing     84  
Finishing    80  
Even if two teams possess similar overall quality, differences in the composition of their Rating Vectors produce different predicted match behaviours.

## 10.15.3 Advantages of Vector Representation

Representing teams as vectors provides several advantages.  
It:

* preserves multidimensional information,   
* avoids unnecessary aggregation,   
* improves model interpretability,   
* supports flexible machine learning models,   
* enables future expansion of the rating framework. 

The Rating Vector therefore serves as the canonical representation of team strength throughout GLPM.

# 10.16 Expected Goals Inputs

## 10.16.1 From Ratings to Match Simulation

The Expected Goals Engine receives the Rating Vectors of both competing teams.  
For a match between the Home Team and Away Team,  
RH and RA  
form the principal inputs to the prediction process.

## 10.16.2 Interaction Between Teams

Rather than evaluating teams independently, GLPM compares the Rating Vectors of both opponents simultaneously.  
This allows the model to estimate interactions such as:

* Home Attack versus Away Defence.   
* Home Build-Up versus Away Pressing.   
* Home Finishing versus Away Goalkeeper.   
* Home Possession versus Away Pressing.   
* Away Attack versus Home Defence.   
* Away Finishing versus Home Goalkeeper. 

These interactions provide a richer description of expected match dynamics than isolated team statistics.

## 10.16.3 Conceptual Interaction Matrix

                 HOME TEAM

 Attack        ─────────────┐  
 Defence                    │  
 Goalkeeper                 │  
 Build-Up                   │  
 Possession                 │  
 Pressing                   │  
 Finishing                  │  
                            ▼  
                    Expected Goals Engine  
                            ▲  
 Attack                    │  
 Defence                   │  
 Goalkeeper                │  
 Build-Up                  │  
 Possession                │  
 Pressing                  │  
 Finishing                 │

                 AWAY TEAM  
The Expected Goals Engine evaluates the interaction between both Rating Vectors to estimate offensive and defensive performance for each team.

# 10.17 Model Outputs

## 10.17.1 Expected Goals Estimation

Using the Home and Away Rating Vectors, the Expected Goals Engine estimates

* Home Expected Goals   
* Away Expected Goals 

These estimates represent the expected attacking output of each team after considering the interaction of all seven Primary Ratings.

## 10.17.2 Downstream Prediction Models

The Expected Goals estimates are subsequently supplied to higher-level prediction models responsible for estimating:

* Match Result Probabilities   
* Correct Score Probabilities   
* Goal Totals   
* Both Teams to Score   
* Team Goal Distributions   
* League Points   
* Season Standings 

Thus, the Expected Goals Engine forms the bridge between latent football ability and observable football outcomes.

## 10.17.3 Complete Prediction Architecture

The complete GLPM architecture can now be represented as follows.  
                        Historical Match Data  
                                  │  
                                  ▼  
                         Feature Engineering  
                                  │  
                                  ▼  
                       42 Component Ratings  
                                  │  
                                  ▼  
                        21 Domain Ratings  
                                  │  
                                  ▼  
                         7 Primary Ratings  
                                  │  
                                  ▼  
                          GLPM Rating Vector  
                    ┌──────────────┴──────────────┐  
                    │                             │  
                    ▼                             ▼  
             Home Team Vector              Away Team Vector  
                    │                             │  
                    └──────────────┬──────────────┘  
                                   ▼  
                        Expected Goals Engine  
                                   │  
                                   ▼  
                     Home xG               Away xG  
                                   │  
                                   ▼  
                      Match Prediction Models  
                                   │  
                                   ▼  
                         League Prediction Models
