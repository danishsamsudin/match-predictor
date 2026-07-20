## Chapter 2 - Data Architecture



### 2.1 Purpose



The Data Architecture forms the foundation of the Graham League Prediction Model (GLPM). It defines how football information is collected, stored, validated and organised before any ratings or predictions are generated.

GLPM is designed around the principle that all predictions should be reproducible from historical data. Every rating, probability and forecast must be traceable back to objective match events.

The data architecture therefore separates:

* Observed facts


* Engineered features


* Estimated ratings


* Final predictions



This layered approach allows the model to evolve while preserving historical consistency.

---

### 2.2 Core Design Principles



The database follows six guiding principles.

**Principle 1 - Store Facts, Not Opinions**


The database records measurable football events, never subjective judgements.

* Liverpool generated 2.31 xG


* X Liverpool played brilliantly



Interpretation belongs to the rating engine, not the database.

**Principle 2 - Raw Data Never Changes**


Historical match data is immutable.
If a rating algorithm changes in Version 2.0, all ratings can simply be recalculated from the same raw data.
Nothing is permanently overwritten.

**Principle 3 - Every Observation Has Time**


Football teams evolve.
Every observation, rating and prediction must include:

* Date


* Competition


* Season


* Matchweek


* Timestamp



This allows the model to understand progression over time.

**Principle 4 - Separate Facts from Estimates**


GLPM separates four distinct layers:

| Laver | Contents |
| --- | --- |
| Raw Data

 | Match events and statistics

 |
| Features

 | Derived metrics

 |
| Ratings

 | Latent team/player abilities

 |
| Predictions

 | Match probabilities

 |

Each layer depends only on the one above it.

**Principle 5 - Every Prediction Must Be Explainable**


If GLPM predicts:
Home $xG=1.82$
the model should be able to explain the contribution of every component.

Example:

| Component | Adjustment |
| --- | --- |
| Base Attack Rating

 | +1.34

 |
| Opponent Defence

 | -0.28

 |
| Home Advantage

 | +0.16

 |
| Player Availability

 | -0.09

 |
| Tactical Matchup

 | +0.11

 |
| Weather

 | -0.03

 |
| Final Home xG

 | 1.82

 |

No prediction should be a black box.

**Principle 6 - Modular Expansion**


New modules should be added without redesigning the database.
Future additions may include:

* Tracking data


* Pressing locations


* Formation recognition


* Passing networks


* Live in-play events



The architecture is designed to support these additions.

---

### 2.3 Four-Layer Data Architecture



The entire GLPM database is organised into four logical layers.

**Layer 4**


Predictions
Expected Goals
Win Probability
BTTS
Correct Scores

**Layer 3**


Latent Ratings
Attack
Defence
Goalkeeper
Transition
Set Pieces

**Layer 2**


Engineered Features
xG/Shot
Field Tilt
PPDA
Box Entry Rate
Big Chance Rate

**Layer 1**


Raw Match Data
Shots
Passes
Goals
Possession
Lineups
Weather

Only Layer 1 stores permanent football events.
Everything above it can be regenerated.

---

### 2.4 Database Structure



GLPM is organised into interconnected domains.

GLPM Database
Teams
Players
Matches
Match Statistics
Match Context
Team Ratings
Player Ratings
Rating History
Tactical Profile Data
Prediction History
Validation Logs

Each domain has a clearly defined responsibility.

---

### 2.5 Core Tables



**Teams**


Stores one record per club.

| Variable | Description |
| --- | --- |
| Team ID

 | Unique identifier

 |
| Team Name

 | Official club name

 |
| League

 | Competition

 |
| Country

 | Nation

 |
| Stadium

 | Home venue

 |
| Capacity

 | Stadium size

 |
| Altitude

 | Stadium altitude

 |
| Promotion Status

 | Newly promoted indicator

 |
| Manager

 | Current manager

 |

**Players**


Stores one record per registered player.

| Variable | Description |
| --- | --- |
| Player ID

 | Unique identifier

 |
| Team ID

 | Current club

 |
| Position

 | Playing position

 |
| Age

 | Years

 |
| Preferred Foot

 | Left/Right

 |
| Height

 | cm

 |
| Minutes Played

 | Season total

 |
| Availability

 | Fit/Injured/Suspended

 |

**Matches**


Stores fixture information.

| Variable | Description |
| --- | --- |
| Match ID

 | Unique identifier

 |
| Date

 | Fixture date

 |
| Season

 | Competition season

 |
| Matchweek

 | League round

 |
| Competition

 | League/Cup

 |
| Home Team

 | Club

 |
| Away Team

 | Club

 |
| Venue

 | Stadium

 |
| Referee

 | Match official

 |

---

### 2.6 Match Statistics Database



This is the most important table in GLPM.
Every statistic used anywhere in the model originates here.

**Attacking Statistics**

* Goals


* Expected Goals (xG)


* Non-Penalty xG


* Open Play xG


* Set Piece xG


* Shots


* Shots on Target


* Big Chances


* Box Entries


* Touches in Opposition Box


* Progressive Passes


* Progressive Carries


* Final Third Entries


* Crosses


* Through Balls



**Defensive Statistics**

* xG Conceded


* Shots Conceded


* Big Chances Conceded


* Box Entries Allowed


* Blocks


* Interceptions


* Tackles


* Clearances


* Pressures


* PPDA


* Ball Recoveries


* High Turnovers Forced



**Possession Statistics**

* Possession %


* Pass Completion %


* Field Tilt


* Territory %


* Build-up Speed


* Sequence Length



These are factual observations only.

---

### 2.7 Tactical Profile Database



This section does not calculate tactical ratings-it stores the information required to build them later (Chapter 9).
Football performance depends not only on overall quality but also on how teams interact with different playing styles. To support future tactical modelling, GLPM records performance against distinct tactical profiles.

**Opponent Style Classification**


Each opponent is assigned one or more style labels based on objective metrics. Examples include:

* High Possession


* Low Possession


* High Press


* Mid Block


* Low Block


* Counter-Attacking


* Transition-Focused


* Direct Play


* Crossing-Oriented


* Build-Up Play


* Wide Attack


* Central Combination Play


* Set-Piece Reliant



These labels are descriptive data, not ratings.

**Performance by Opponent Style**


For each match, GLPM stores how a team performed against the opponent's tactical profile.
Examples:

| Opponent Style | Data Recorded |
| --- | --- |
| High Possession

 | XG created, xG conceded, shots, PPDA, field tilt

 |
| Counter-Attacking

 | Transition chances conceded, recovery speed, counter xG conceded

 |
| High Press

 | Build-up success, turnovers, progressive passes completed

 |
| Crossing Teams

 | Crosses faced, aerial duel success, headed shots conceded

 |
| Direct Teams

 | Long-ball success allowed, second-ball recoveries

 |
| Low Block

 | Box entries, patience of possession, shot quality

 |

These observations will later be aggregated into style-specific ratings in Chapter 9 - Tactical Matchup Engine.

---

### 2.8 Engineered Features



The model derives secondary statistics from raw observations.
Examples:

| Feature | Formula |
| --- | --- |
| xG per Shot

 | xG Shots

 |
| Shot Conversion

 | Goals Shots

 |
| Big Chance Rate

 | Big Chances Shots

 |
| Box Shot %

 | Box Shots Total Shots

 |
| Progressive Pass Rate

 | Progressive Passes Total Passes

 |
| Field Tilt

 | Final-third possession share

 |
| Counter Efficiency

 | Transition xG Counter Attacks

 |

Derived features are recalculated whenever required and generally not stored permanently unless computationally expensive.

---

### 2.9 Team Rating Database



The Team Rating Database stores GLPM's current estimates of each team's underlying football abilities. Unlike raw match statistics, these values are latent ratings that cannot be observed directly. Instead, they are inferred through statistical modelling and machine learning using the historical match data, engineered features and contextual information defined earlier in this chapter.

The Team Rating Database has been designed using a hierarchical architecture, allowing complex football performance to be represented through multiple interconnected layers rather than a single strength score.

This architecture improves interpretability, modularity and future scalability while allowing each rating to be independently validated and updated.

The Team Rating Database consists of four distinct layers:

* Level 1 - Primary Ratings


* Level 2 - Component Ratings


* Level 3-Interaction Profiles


* Level 4 - Rating Metadata



Each layer serves a different purpose within the overall prediction framework.

**Level 1 – Primary Ratings**


Primary Ratings represent the team's broad footballing abilities. These ratings are the principal outputs used throughout GLPM and provide a concise summary of long-term team quality.

| Primary Rating | Description |
| --- | --- |
| Attack Rating

 | Overall ability to create scoring opportunities against league-average opposition.

 |
| Defence Rating

 | Overall ability to suppress opposition chance creation.

 |
| Goalkeeper Rating

 | Shot-stopping performance relative to expected goals conceded.

 |
| Finishing Rating

 | Ability to convert scoring opportunities above or below expected levels.

 |
| Pressing Rating

 | Ability to regain possession through coordinated pressing.

 |
| Build-Up Rating

 | Ability to progress possession from defensive areas into attack.

 |
| Possession Rating

 | Ability to control possession and dictate the tempo of play.

 |

These ratings represent intrinsic team characteristics and evolve gradually as additional evidence becomes available.

Although these ratings are used throughout the prediction engine, they are not estimated directly. Instead, each Primary Rating is constructed from a collection of more specialised Component Ratings.

**Level 2 – Component Ratings**


Component Ratings measure the individual football processes that collectively determine a team's overall strengths.

Rather than attempting to estimate an Attack Rating directly, GLPM first estimates the underlying processes responsible for attacking performance before combining them into a single higher-level rating.

| Component | Purpose | Example Data |
| --- | --- | --- |
| Chance Volume

 | Frequency of chance creation.

 | Shots, xG, box entries, shot attempts

 |
| Chance Quality

 | Quality of opportunities created.

 | xG per shot, big chances, shot location

 |
| Ball Progression

 | Ability to advance possession into dangerous areas.

 | Progressive passes, carries, final-third entries

 |
| Territorial Control

 | Ability to sustain attacking pressure.

 | Field tilt, attacking-third possession, touches in final third

 |
| Transition Threat

 | Ability to create chances immediately after regaining possession.

 | Transition xG, fast breaks, direct attacks

 |
| Set Piece Threat

 | Ability to create danger from dead-ball situations.

 | Set-piece xG, corners, attacking free kicks

 |

For example, the Attack Rating is constructed from the following components:
Similarly, the Defence Rating is built from defensive components, including:

* Chance Suppression


* Defensive Organisation


* Transition Defence


* Box Protection


* Set Piece Defence


* Press Resistance


* Defensive Territorial Control



Each component captures a specific aspect of football performance and is estimated independently using engineered features and machine learning techniques described in later chapters.

This hierarchical structure enables GLPM to explain why a team's overall rating changes rather than simply reporting that it has changed.

**Level 3 - Interaction Profiles**


While Primary Ratings describe a team's overall abilities, football performance is also influenced by how different tactical styles interact.

To capture these effects, GLPM stores a collection of Interaction Profiles.

Interaction Profiles describe how a team's strengths and weaknesses change when facing opponents with specific tactical characteristics. Unlike Primary Ratings, these profiles are not intended to measure overall quality. Instead, they provide additional context for specific matchups.

Examples of attacking interaction profiles include:

* Attack vs High Press


* Attack vs Mid Block


* Attack vs Low Block


* Attack vs High Defensive Line


* Attack vs Possession Teams


* Attack vs Direct Play


* Attack vs Aggressive Press


* Attack vs Wide Defensive Systems



Examples of defensive interaction profiles include:

* Defence vs Possession Teams


* Defence vs Counter Attacks


* Defence vs Transition-Based Teams


* Defence vs Direct Play


* Defence vs Crossing Teams


* Defence vs Wide Attacks


* Defence vs Central Combination Play


* Defence vs Set Pieces



These profiles are learned from historical performance against different tactical styles and evolve continuously as additional evidence becomes available.

They are not used directly within the Expected Goals Engine.

Instead, they are combined dynamically within the Tactical Interaction Engine (Chapter 9) to estimate how the tactical characteristics of two opposing teams influence the expected goals for a particular fixture.

Separating Interaction Profiles from Primary Ratings ensures that intrinsic team quality remains stable while tactical matchup effects remain fixture-specific.

**Level 4 - Rating Metadata**


Every rating stored within GLPM includes additional metadata describing its reliability, uncertainty and historical development.

Each rating stores:

| Metadata | Purpose |
| --- | --- |
| Current Value

 | Latest estimated rating.

 |
| Confidence Score

 | Statistical confidence in the estimate.

 |
| Matches Used

 | Number of matches contributing to the estimate.

 |
| Last Updated

 | Date of the most recent recalculation.

 |
| Rating Variance

 | Estimated uncertainty surrounding the rating.

 |
| Recent Trend

 | Direction and magnitude of recent movement.

 |
| Historical Peak

 | Highest recorded value.

 |
| Historical Low

 | Lowest recorded value.

 |

This metadata allows GLPM to distinguish between mature ratings supported by extensive evidence and provisional ratings based on limited observations.
It also provides transparency when interpreting rating movements over time.

**Relationship Between Rating Layers**


The Team Rating Database follows a hierarchical architecture in which observable football events are progressively transformed into higher-level football intelligence.

Historical Match Data
↓
Engineered Features
↓
Component Ratings
↓
Primary Ratings
↓
Interaction Profiles
↓
Expected Goals Engine
↓
Prediction Models

Each layer builds upon the previous one while maintaining a clear separation of responsibilities.

* Component Ratings measure individual football processes.


* Primary Ratings summarise overall team ability.


* Interaction Profiles describe how those abilities perform against different tactical styles.


* Prediction Models combine all available information to estimate match outcomes.



This layered architecture provides a transparent, explainable and extensible foundation for the Graham League Prediction Model, allowing future improvements to be incorporated without redesigning the underlying rating system.

---

### 2.10 Player Rating Database



Each player has specialised ratings rather than one overall score.
Examples include:

* Finishing


* Chance Creation


* Ball Progression


* Passing


* Press Resistance


* Pressing


* Defensive Positioning


* Tackling


* Aerial Ability


* Set Pieces


* Goalkeeping (where applicable)



These ratings combine to estimate the impact of the expected starting lineup.

---

### 2.11 Match Context Database



Context influences a match without permanently changing team strength.
Variables include:

* Home Advantage


* Travel Distance


* Rest Days


* Fixture Congestion


* Weather


* Temperature


* Wind Speed


* Altitude


* Attendance


* Referee


* Manager Changes


* European Fixtures


* International Break Recovery



These variables adjust match predictions but do not directly modify long-term ratings.

---

### 2.12 Prediction Database



Every forecast generated by GLPM is archived.
Stored outputs include:

* Predicted Home xG


* Predicted Away xG


* Win/Draw/Loss Probabilities


* BTTS Probability


* Over/Under Markets


* Correct Score Matrix


* Model Version


* Prediction Timestamp



This allows performance tracking and future recalibration.

---

### 2.13 Historical Archive



Every rating update is stored as a historical snapshot.
Example:

| Date | Team | Attack | Defence | Chance Quality |
| --- | --- | --- | --- | --- |
| Aug 10

 | Arsenal

 | 1.18

 | 0.96

 | 1.11

 |
| Aug 17

 | Arsenal

 | 1.22

 | 0.95

 | 1.15

 |
| Aug 24

 | Arsenal

 | 1.27

 | 0.93

 | 1.18

 |

This enables trend analysis, regression detection and historical model evaluation.

---

### 2.14 Data Validation



Before entering the model, all records are validated.
Examples include:

* Goals $\ge0$ and integer.


* $xG\ge0.$

* Non-penalty xG < Total xG.


* Big Chances  Shots.


* Shots on Target ≤ Shots.


* Home Possession + Away Possession $\approx100\%$

* Minutes Played $\le120$

* Team IDs and Player IDs must exist.



Invalid records are flagged rather than silently accepted.