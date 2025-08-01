# TODO: Business Testing Suite

A single, actionable checklist to guide the creation, execution, and analysis of a repeatable testing harness for the Evolution Solver.

---

## 🎯 Objective

To systematically measure and improve the generation of high-quality business ideas, with the primary goal of **maximizing the top score** of the best solution while controlling for cost.

---

## 📈 Key Performance Indicators (KPIs)

These proxy metrics will be tracked and averaged across all test runs to evaluate performance.

-   [ ] **Overall Idea Quality** — Maximise **Average Top Score** per job.
-   [ ] **Search Efficiency** — Maximise **Average Top Score ÷ Total Tokens**.
-   [ ] **Idea Variability** — Maximise **Score Standard Deviation** across the solution population.
-   [ ] **Initial Idea Quality** — Maximise **Average Generation 1 Score**.
-   [ ] **Evolutionary Improvement** — Maximise **Average ΔScore per Generation**.

---

## 🛠️ Workplan

### Phase 1: Curate Test Set & Generate Baseline

*   [ ] **Task 1.1: Curate Benchmark Problems**
    *   Assemble a fixed list of **30 diverse problems** that reflect real-world use cases.
    *   Commit the list to `test/business/problems.json` as a JSON array of `{ "id": "...", "context": "..." }`.
    *   Create `docs/problem_rationale.md` to add a one-sentence justification for each problem's inclusion.

*   [ ] **Task 1.2: Build the Test Runner Script**
    *   Create `scripts/business-testing/run-test-suite.js`.
    *   The script will accept a configuration file (e.g., `baseline-config.json`) and run the solver for all 30 problems.
    *   It should poll for job completion and output a list of all `jobId`s to a results folder.
    *   **Best Practice:** The script should be configurable to point to a separate test database (e.g., `evolution-results-test`) to keep benchmark data isolated.

*   [ ] **Task 1.3: Build the Analytics Aggregator Script**
    *   Create `scripts/business-testing/aggregate-results.js`.
    *   This script will take a list of `jobId`s, fetch the full job data, and calculate the KPIs for each job.
    *   It should save the raw job outputs to a directory (e.g., `test/business/results/baseline/raw/`).
    *   It will aggregate the per-job KPIs and write the final summary to a single file (e.g., `test/business/results/baseline/kpis.json`).

*   [ ] **Task 1.4: Run Baseline Test & Document**
    *   Create a `baseline-config.json` with the standard `{ "generations": 20, "populationSize": 10 }` parameters.
    *   Execute the test suite to generate the baseline data and KPIs.
    *   Summarize the key baseline numbers in `docs/baseline_kpis.md`. This is our benchmark.

### Phase 2: Formulate & Implement Experiments

*   [ ] **Task 2.1: Implement Improvement Theses in Code**
    *   **Thesis A: Depth vs. Breadth:** No code change needed. Create a new config file for a `10x20` run.
    *   **Thesis B: Negative Ideas:** Modify `src/core/evolutionarySolver.js` to allow the `variator` prompt to accept and use a list of "concepts to avoid," derived from low-scoring ideas.
    *   **Thesis C: Score-Aware Variator:** Modify the `variator` to include the `score` of the top performers in its prompt, instructing the LLM to learn from what makes an idea high-scoring.

### Phase 3: Analyze & Report

*   [ ] **Task 3.1: Run Experiments**
    *   Execute the test suite for each experimental thesis (A, B, C).
    *   Organize the results into separate directories (e.g., `test/business/results/experiment-A/`).

*   [ ] **Task 3.2: Create Analysis & Visualization Tools**
    *   Write an analysis script or notebook (`analysis/suite_report.ipynb` or `.js`) to process the aggregated KPI files.
    *   This tool should generate visualizations (e.g., top score distributions, cost per point gained) and export them to `docs/img/`.
    *   Create a comparison utility (`scripts/business-testing/compare-results.js`) to generate a clear markdown table comparing the KPIs of any two result files.

*   [ ] **Task 3.3: Compile Final Report**
    *   Use the outputs from the analysis tools to compile the findings into a comprehensive `docs/suite_report.md`.
    *   This report should clearly state the winning and losing theses and recommend which changes should be integrated into the main branch.

### Phase 4: Automate & Maintain

*   [ ] **Task 4.1: Implement Regression Guard**
    *   Add a new GitHub Action workflow (`.github/workflows/business-test.yml`).
    *   This action will trigger on pull requests that modify core solver logic.
    *   It will run a lightweight version of the test suite (e.g., on 3-5 representative problems) against the PR branch.
    *   The build will **fail if any key proxy metric regresses by more than a defined threshold (e.g., 5%)**.

---

## 📌 Next Steps

-   [ ] Decide on the regression threshold (X%) and the acceptable compute budget for the CI action.
-   [ ] Schedule a kick-off meeting to curate the initial list for `test/problems.json`.
-   [ ] Assign owners for the initial script creation tasks (Runner & Aggregator).
