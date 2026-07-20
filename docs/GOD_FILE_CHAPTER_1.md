## The Graham League Prediction Model (GLPM)



### Technical Specification & Implementation Guide



**Volume I Foundation**

### Chapter 1 - Introduction & Model Philosophy



#### 1.1 Purpose



The Graham League Prediction Model (GLPM) is a probabilistic football prediction framework designed to estimate:

* Expected Goals (xG)


* Match Scorelines


* Match Outcomes (Home / Draw / Away)


* Both Teams to Score (BTTS)


* Over/Under Goal Markets


* Correct Scores


* Team Goal Totals



Unlike traditional football ranking systems, GLPM is not designed to rank teams. Its primary objective is to estimate the probability distribution of future football matches as accurately as possible.

---

#### 1.2 Philosophy



Every football match is treated as the interaction between two underlying processes:

1. Chance Creation


2. Chance Prevention



Rather than asking:
"Which team is stronger?"

GLPM asks:
"How many quality chances will each team create against this specific opponent?"

Everything in the model is built around answering that question.

---

#### 1.3 Core Principle



Most football prediction systems begin by estimating an overall team strength.
GLPM does not.

Instead, the model estimates:

* **Team Quality** -> **Expected Home xG** -> **Expected Away xG** -> **Scoreline Distribution** -> **Outcome Probabilities**


This architecture ensures that every prediction originates from expected goals rather than arbitrary rating systems.

---

#### 1.4 Why Expected Goals?



Goals are relatively rare events.
A team may score:

* 3 goals from 0.8 xG


* 0 goals from 2.6 xG



Both performances tell very different stories. Expected Goals provide a better estimate of underlying team performance because they measure the quality of chances created rather than the final outcome.

Therefore, GLPM treats goals as the model's output, not its input.

---

#### 1.5 Model Philosophy



The model assumes every team possesses several latent abilities. These abilities cannot be observed directly. Instead, they are estimated from historical match data.

Initially, GLPM will estimate:

| Rating | Purpose |
| --- | --- |
| **Attack Rating** | Ability to create chances |
| **Defence Rating** | Ability to prevent chances |
| **Chance Quality Rating** | Ability to create high-quality opportunities |
| **Goalkeeper Rating** | Ability to prevent goals beyond expected |
| **Set Piece Rating** | Effectiveness from dead-ball situations |
| **Transition Rating** | Effectiveness during transitions |
| **Player Availability Rating** | Current strength of available squad |
| <br><br> |  |

These ratings continually evolve throughout the season.

---

#### 1.6 Why Separate Attack and Defence?



Many existing models use one rating.
Example:

* Manchester City Overall Rating 94



This tells us little.
Instead GLPM separates:

* Manchester City Attack: 1.42


* Manchester City Defence: 1.31



A team may possess excellent attack and average defence or poor attack and elite defence. Treating these separately greatly improves prediction accuracy.

---

#### 1.7 Modularity



Each component is independent.

1. Historical Data. ->


2. Attack Engine ->


3. Defence Engine ->


4. Chance Quality Engine  ->


5. Player Engine ->


6. Context Engine ->


7. Expected Goals Engine ->


8. Scoreline Engine ->


9. Outcome Markets



Each stage can be improved without redesigning the entire model.

---

#### 1.8 Why Not One Strength Index?



The World Cup model uses a weighted strength index containing variables such as:

* Elo


* FIFA Ranking


* Momentum


* Recent Form


* Talent



While effective in tournament football, these variables often measure overlapping concepts. GLPM replaces this with specialist models.

Rather than asking "How strong is Liverpool?", the model asks:

* How good is Liverpool's attack?


* How good is Liverpool's defence?


* How dangerous are Liverpool's chances?


* How much does the goalkeeper prevent?


* Which players are unavailable?


* How well does Liverpool match up tactically with this opponent?



This decomposition makes the model more transparent and easier to improve.

---

#### 1.9 Prediction Pipeline



Every prediction follows the same sequence.

1. Historical Match Data  ->


2. Opponent-Adjusted Team Ratings ->


3. Player Availability ->


4. Context Adjustments ->


5. Tactical Matchups ->


6. Expected Home xG / Expected Away xG ->


7. Probability Distribution ->


8. Home Win / Draw / Away Win / BTTS / Over/Under / Correct Score



This hierarchy ensures consistency. Every market is derived from the same underlying expected-goals estimates rather than separate models.

---

#### 1.10 Guiding Principles



Every new variable added to GLPM must satisfy four criteria:

1. **Predictive Value**: It must improve out-of-sample prediction accuracy.


2. **Stability**: It should represent a repeatable team characteristic rather than random variation.


3. **Interpretability**: Its impact should be explainable. If a variable changes a prediction, we should be able to describe why.


4. **Independence**: Each variable should contribute unique information. If two variables measure essentially the same concept, only one should remain.



---

#### 1.11 Long-Term Vision



GLPM is designed to evolve incrementally. Future versions may incorporate:

* Tracking data


* Player positioning


* Pressing intensity


* Tactical formations


* Machine-learned coefficients


* Live in-play updates


* Automated model retraining



However, the underlying philosophy will remain unchanged:
Estimate the quality and quantity of chances each team is expected to create and concede, then derive all match probabilities from those estimates.