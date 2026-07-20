## Standard Chapter Structure

Every Primary Rating chapter follows an identical hierarchical structure. This standardization ensures consistency across all football domains and reflects the modular design philosophy of the Graham League Prediction Model.

Each chapter progresses from broad conceptual foundations to increasingly detailed statistical modelling before concluding with the estimation of the Primary Rating.

The six-part structure is as follows:

### Part I - Foundations
This section introduces the rating from a football and modelling perspective.

It defines:
* The purpose of the rating.
* The underlying football philosophy.
* The mathematical definition.
* The football interpretation of the rating.

The objective is to explain what the rating measures and why it is important.

---

### Part II - Data Pipeline

This section describes how raw football observations are transformed into model-ready features.

The pipeline consists of:
* Data Sources & Raw Inputs
* Data Preparation & Cleaning
* Feature Engineering
* Context & Opposition Adjustment

At the conclusion of Part II, the model has produced adjusted features representing the underlying football behaviours relevant to the rating.

The common pipeline is:
1. Historical Match Data
2. Raw Observations
3. Data Cleaning
4. Feature Engineering
5. Context & Opposition Adjustment
6. Adjusted Features

---

### Part III - Component Ratings

Each Primary Rating is decomposed into six specialised Component Ratings. These Component Ratings represent the most granular latent football abilities estimated directly from the engineered features.

Each Component Rating follows the same structure:

* Purpose
* Football Interpretation
* Raw Inputs
* Engineered Features
* Statistical Estimation
* Machine Learning Model
* Outputs
* Relationship to Domain Rating

These sections explain how individual football abilities are modelled before aggregation.

---

### Part IV - Rating Calibration

The estimated Component Ratings and Domain Ratings are calibrated using the universal GLPM calibration framework introduced in Chapter 3.

Calibration ensures:
* Statistical consistency.
* Cross-league comparability.
* Temporal stability.
* Reliable uncertainty estimates.

This calibration methodology is identical across all Primary Ratings.

---

### Part V - Domain Ratings

The six Component Ratings are aggregated into three intermediate Domain Ratings. Each Domain Rating combines two closely related Component Ratings representing a broader football capability.

Every Domain Rating includes:
* Purpose
* Component Ratings
* Football Interpretation
* Mathematical Definition
* Outputs
* Relationship to the Primary Rating

These Domain Ratings act as the bridge between individual football abilities and the overall Primary Rating.

---

### Part VI - Primary Rating

Finally, the three Domain Ratings are combined to estimate the Primary Rating.

This concluding section presents:
* Primary Rating Estimation
* Relationship to the GLPM Framework
* Chapter Summary

The chapter concludes by showing how the Primary Rating integrates into the wider GLPM architecture and contributes to the Expected Goals Engine.