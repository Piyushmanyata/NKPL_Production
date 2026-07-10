# AGENTS.md — Planning-First Multi-Agent Execution Protocol


## 0. Task Triage and Protocol Selection

Classify the task **before** repository-wide planning, skill discovery, or delegation. Use the lowest-cost tier that safely fits. Risk always overrides line count.

### 0.1 Trivial Fast Path

Use the Trivial tier only when **all** of these are true:

- The expected change is confined to one file, or at most two tightly related files.
- The expected implementation is roughly 50 changed lines or fewer, excluding generated files and tests.
- The request and acceptance condition are unambiguous.
- There is no schema, migration, authentication, authorization, public API, dependency, build-system, deployment, billing, secret, production-data, or irreversible change.
- There is no broad UI redesign or cross-component contract change.
- One focused test, build check, or deterministic manual check can verify the result.
- Failure has a low blast radius and the change is easy to revert.

Trivial tasks use: **inspect → implement the smallest change → focused test → diff review → report**.

For Trivial tasks:

- Do not run Grill Me unless a material ambiguity appears.
- Do not create sub-agents merely to satisfy process.
- Do not perform broad skill-registry searches or install new skills unless the task genuinely requires one.
- Do not create project-management files.
- Use Ponytail and LeanCTX normally. Use an existing Graphify graph when available; do not rebuild the entire repository graph solely for a self-contained trivial edit.
- Stop and reclassify as Standard or Substantial immediately if any Trivial criterion becomes false.

### 0.2 Standard Task

Use the Standard tier for bounded features, fixes, or refactors that normally involve about 2–5 files or 50–300 changed lines, have moderate integration needs, and remain reversible and low-to-medium risk.

Standard tasks require:

- A concise Project Completion Goal.
- Focused repository reconnaissance.
- A compact plan with acceptance criteria and verification.
- Grill Me only for unresolved decisions that materially change scope, architecture, UX, data, risk, or cost.
- Targeted skill discovery rather than a broad registry sweep.
- Delegation only when the expected quality or time benefit exceeds orchestration overhead.
- Batch execution with at least one integrated verification gate.
- A compact adversarial review or pre-mortem.

### 0.3 Substantial or High-Risk Task

Use the full protocol for large features, new systems, multi-component work, unclear requirements, or any high-risk change. A task is automatically Substantial regardless of size when it affects authentication, authorization, payments, production data, migrations, public contracts, security boundaries, compliance, infrastructure, destructive operations, or difficult rollback.

Substantial tasks require the complete Grill Me, planning, skill, delegation, batch, adversarial-review, and final-review workflow in this file.

### 0.4 Triage Output

Record the selected tier and one-sentence justification. The user may explicitly require a stricter tier. Never downgrade a task merely to reduce cost when the risk profile requires a stronger process.

---

## 1. Purpose

This repository must be completed through the level of planning, specialized skills, delegation, phased execution, and evidence-based verification selected by the Task Triage gate.

The agent must optimize for:

1. Correctness and completeness.
2. Exact alignment with the user's intent.
3. Minimal unnecessary code and complexity.
4. Maximum safe parallelism.
5. High output quality per token used.
6. Clear checkpoints, rollback paths, and proof of completion.

The agent must **never** attempt a large project as one uninterrupted, one-shot implementation.

---

## 2. Instruction Priority

Follow instructions in this order:

1. System, platform, security, and legal requirements.
2. The user's latest explicit instructions.
3. This `AGENTS.md` file.
4. Repository-local conventions and documentation.
5. Relevant installed skills.
6. Reasonable engineering defaults.

When instructions conflict, follow the higher-priority instruction and explicitly record the conflict.

---

## 3. Non-Negotiable Operating Rules

The agent must:

- Classify every task through the Task Triage gate before choosing process depth.
- Define the **Project Completion Goal** before implementation work; a single measurable sentence is sufficient for Trivial work.
- Inspect the relevant repository area and existing documentation before asking questions that the repository can answer.
- Use the **Grill Me** skill before finalizing any substantial project plan, and use a focused version for Standard work only when material ambiguity exists.
- Ask only the questions needed for the selected tier, but continue until material ambiguity is resolved.
- Produce a complete, executor-ready plan before Standard or Substantial implementation; Trivial work uses the fast-loop goal and acceptance check.
- Adversarially review Standard and Substantial plans at the depth required by their tier; Trivial work receives post-change edge-case review.
- Keep **Ponytail**, **LeanCTX**, and **Graphify** active at an intensity proportional to the task tier.
- Discover and use relevant, trustworthy, non-duplicative skills only when their expected value exceeds their setup and context cost.
- Delegate substantial work to specialized sub-agents when the harness supports it and the expected benefit exceeds orchestration overhead.
- Parallelize independent work only when real concurrency is supported and file, state, dependency, and integration conflicts are controlled.
- Execute Standard and Substantial work in small, verifiable batches; execute Trivial work through the complete fast loop.
- Recheck the affected repository state after every batch or Trivial implementation.
- Stop and re-plan or reclassify when evidence invalidates the plan or tier.
- Perform tier-appropriate technical, functional, visual, and regression review before declaring completion.
- Show evidence for every completion claim.

The agent must not:

- Jump from a vague request directly into implementation.
- Generate a Standard or Substantial project in one batch. Trivial work may use one implementation batch followed by mandatory verification.
- Ask the user questions that can be answered by inspecting the repository, documentation, configuration, tests, or existing product.
- Install or execute untrusted skills without inspection.
- Load every available skill into context at once.
- Delegate overlapping edits to multiple agents without explicit ownership boundaries.
- Claim success because code “looks correct.”
- Skip tests, visual validation, or final integration review because an individual sub-agent reported success.
- Add speculative abstractions, frameworks, files, dependencies, or refactors unrelated to the accepted plan.

---

## 4. Required Roles

For Standard and Substantial work, separate these responsibilities when the task and available harness justify the overhead, even when one model performs more than one role.

### 4.1 Planner

The Planner owns:

- Requirement discovery.
- Repository reconnaissance.
- User interview and Grill Me session.
- Skill discovery and selection.
- Architecture and execution design.
- Phase and batch decomposition.
- Acceptance criteria and verification design.
- Risk, dependency, and rollback planning.

Use the strongest available reasoning model for planning. Do not invent model names or claim unavailable capabilities.

### 4.2 Executor / Orchestrator

The Executor owns:

- Translating the accepted plan into bounded work packages.
- Assigning work to sub-agents.
- Enforcing file and responsibility ownership.
- Running independent work according to the detected concurrency capability.
- Integrating results in controlled batches.
- Verifying every batch before continuing.
- Maintaining the execution ledger.

The Executor should orchestrate rather than personally perform every task.

### 4.3 Specialized Sub-Agents

When delegation is warranted, create narrowly scoped sub-agents for work such as:

- Repository mapping and architecture analysis.
- Frontend implementation.
- Backend or API implementation.
- Database and migration work.
- Test creation and test execution.
- Security review.
- Performance review.
- Accessibility review.
- Documentation.
- Visual and browser validation.
- Refactoring or code-quality review.

Each sub-agent must receive only the context required for its assignment.

### 4.4 Reviewer

The Reviewer must be independent from the implementation wherever possible. It owns:

- Plan challenge and edge-case analysis.
- Batch-level review.
- Cross-component integration review.
- Requirements traceability.
- Final bug, security, performance, accessibility, and visual review.

Use a highly capable model for high-risk or architecture-level review.


### 4.5 Delegation and Concurrency Capability Gate

Before creating sub-agents, determine what the current harness actually supports:

- True concurrent sub-agent execution.
- Sequential sub-agent sessions.
- Isolated worktrees, sandboxes, branches, or file ownership.
- Per-agent model routing and token accounting.
- Cancellation, timeout, retry, and result collection.

Rules:

- Never describe sequential role-play inside one context as parallel execution.
- Use true parallel execution only when the harness can run isolated tasks concurrently.
- If only sequential delegation is available, use specialized sessions only when context isolation or review independence justifies their cost.
- If sub-agents are unavailable, the main agent may execute bounded work packages itself, but must preserve checkpoints, ownership boundaries, and independent review where risk requires it.
- Record the detected capability mode in the plan: `concurrent`, `sequential`, or `single-agent`.
- Prefer no delegation over wasteful delegation for Trivial work.

---

## 5. Mandatory Context and Efficiency Stack

### 5.1 Ponytail — Always Active

Use Ponytail to enforce disciplined minimalism:

- Prefer the smallest correct change.
- Reuse existing patterns before creating new ones.
- Avoid speculative generalization.
- Avoid unnecessary abstractions, wrappers, factories, helpers, providers, layers, configuration, and dependencies.
- Do not refactor unrelated code “while here.”
- Delete or simplify code when that is safer than adding more code.
- Preserve all required safety, correctness, and test coverage.

Ponytail must reduce unnecessary work, not reduce required quality.

### 5.2 LeanCTX — Always Active

Use LeanCTX as the context-management layer:

- Map before reading deeply.
- Retrieve focused excerpts instead of dumping whole files.
- Compress noisy shell, build, test, and log output.
- Reuse cached reads and persistent project memory.
- Keep the main agent's context focused on decisions, interfaces, risks, and current evidence.
- Offload broad exploration to dedicated sub-agents and receive concise summaries with file paths and line ranges.
- Compact completed history into a decision ledger before context becomes crowded.
- Never discard unresolved decisions, acceptance criteria, failures, or rollback information during compaction.

### 5.3 Graphify — Always Active

Use Graphify as the repository knowledge layer:

- Build or refresh the project graph before deep architectural planning.
- Query the graph before broad grep, repeated file reads, or manual repository crawling on Standard and Substantial work.
- Use scoped graph questions for architecture, dependencies, data flow, ownership, call paths, and change impact.
- Read target files directly for Trivial work and critical source verification; use Graphify to guide broader traversal and impact analysis rather than treating it as a barrier to source inspection.
- Refresh the graph after structural changes, migrations, new modules, major refactors, or dependency changes.
- Use graph outputs to identify central components, coupling, hidden dependencies, and likely regression zones.
- Do not treat the graph as proof; verify critical conclusions against source code and tests.

### 5.4 Mandatory Tool Bootstrap

At project start for Standard and Substantial work, and only as needed for Trivial work:

1. Detect whether Ponytail, LeanCTX, Graphify, `find-skills`, and required skill support are available.
2. Inspect their current project configuration.
3. Install or configure missing tools only through approved, trustworthy upstream sources and only when the environment permits it.
4. Inspect requested install scripts, permissions, dependencies, and repository modifications before executing them.
5. Record versions or commit identifiers when available.
6. Never silently skip a mandatory tool.
7. Scale tool intensity by tier:
   - **Trivial:** use existing integrations and cached state; avoid full graph rebuilds or expensive setup solely for ceremony.
   - **Standard:** use focused LeanCTX retrieval, a scoped or incremental Graphify map, and Ponytail minimal-diff rules.
   - **Substantial:** use the full context stack, refresh Graphify at structural checkpoints, and preserve durable LeanCTX memory.

If a mandatory tool cannot be used:

- Record the attempted setup and exact blocker.
- Enter **Degraded Mode**.
- Apply the tool's core behavior manually.
- Warn the user or project owner in the next meaningful update.
- Continue only when doing so is safe and does not falsely imply full compliance.

---

## 6. Skill Discovery and Use

### 6.1 Required Discovery

Apply skill discovery by tier:

- **Trivial:** use already installed, directly relevant skills only. Skip registry search and installation unless a missing skill is necessary to complete or verify the task safely.
- **Standard:** invoke `find-skills` and perform a narrow search for the specific stack or risk area only when the repository does not already provide the required guidance.
- **Substantial:** before the final plan, invoke `find-skills`, search trusted registries including `skills.sh`, search by stack, framework, language, infrastructure, testing, deployment, security, design, and task type, and re-run discovery when later phases reveal new technologies or risks.

### 6.2 Selection Standard

Use as many skills as are **relevant, trustworthy, compatible, and non-duplicative**.

Do not maximize raw skill count. Every selected skill must provide clear value and must not create conflicting instructions or unnecessary context.

Before using a third-party skill, inspect:

- Source and maintainer.
- Skill instructions and bundled scripts.
- Required permissions.
- Network access and secret handling.
- Files it may create or modify.
- Compatibility with the repository and agent platform.
- Maintenance status and version.
- Overlap or conflict with already selected skills.

### 6.3 Skill Manifest

Standard and Substantial plans must contain a Skill Manifest. For Standard work it may be a short list; for Substantial work use the table below:

| Skill | Purpose | Phase(s) | Invocation point | Trust/version check | Expected output |
|---|---|---|---|---|---|

Load a skill only when its phase or task needs it. Unload or stop carrying its full text after the relevant work is complete.

### 6.4 Mandatory Planning Skill

The Grill Me skill is mandatory for Substantial planning. For Standard work, use it only for material unresolved decisions. Trivial work skips it unless new ambiguity forces reclassification. Relevant domain, architecture, testing, security, frontend, database, deployment, documentation, and review skills should be added according to the project.

---

## 7. Phase 0 — Establish the Project Completion Goal

Before implementation, write a concise but measurable **Project Completion Goal**. Trivial work needs one sentence stating the requested outcome and proof. Standard and Substantial work should contain:

- User outcome.
- Required deliverables.
- Acceptance criteria.
- Scope.
- Explicit non-goals.
- Constraints.
- Quality level.
- Supported environments and platforms.
- Evidence required to prove completion.

Use this format:

```markdown
## Project Completion Goal

Deliver [outcome] for [user/audience] by producing [deliverables].
The project is complete only when [measurable acceptance criteria] are satisfied,
[required tests/checks] pass, and [required evidence] has been recorded.

### In Scope
- ...

### Out of Scope
- ...

### Constraints
- ...

### Completion Evidence
- ...
```

If the goal is not measurable, planning is not complete.

---

## 8. Phase 1 — Repository Reconnaissance

Before grilling the user, inspect what already exists.

### 8.1 Required Reconnaissance

Scale reconnaissance by tier. Trivial work inspects only the target file, its direct dependencies, applicable repository instructions, and the focused verification path. Standard and Substantial work should:

- Read repository instructions and nested `AGENTS.md` files.
- Inspect README files, architecture docs, ADRs, issue templates, and prior plans.
- Map the relevant repository scope with Graphify; use a full repository graph only when architecture or impact analysis requires it.
- Identify languages, frameworks, package managers, build systems, test systems, deployment targets, and runtime requirements.
- Identify entry points, boundaries, shared interfaces, generated files, and high-risk modules.
- Inspect git status and current branch.
- Establish a clean baseline build and test result where practical.
- Identify existing conventions before proposing new ones.
- Use LeanCTX to avoid broad unfiltered context ingestion.

### 8.2 Reconnaissance Output

Produce a compact repository brief:

- Current architecture.
- Relevant files and modules.
- Existing behavior.
- Known constraints.
- Baseline health.
- Unknowns that genuinely require the user.
- Initial change-impact map.

Do not begin implementation during reconnaissance.

---

## 9. Phase 2 — Grill Me Requirement Discovery

Use the Grill Me skill to reach shared understanding before final planning for Substantial work. For Standard work, ask only questions whose answers materially change the implementation. Trivial work skips this phase unless ambiguity appears.

### 9.1 Interview Rules

- Ask one focused question at a time unless a small grouped question is clearly faster.
- Walk each branch of the decision tree in dependency order.
- For every question, provide the recommended answer and a brief reason.
- Offer concrete options where useful.
- Ask follow-up questions when an answer exposes another material decision.
- Challenge contradictions, hidden assumptions, and scope ambiguity.
- Translate vague quality words such as “fast,” “simple,” “secure,” or “perfect” into measurable criteria.
- Explore the repository instead of asking the user when the answer can be found there.
- Do not ask ceremonial questions whose answers will not change the plan.
- Maintain a decision ledger while interviewing.

### 9.2 Required Topics

Cover all topics that materially affect the project, including as applicable:

- Users and user journeys.
- Exact functional behavior.
- Scope and non-goals.
- UX, UI, responsiveness, and accessibility.
- Data model, lifecycle, migration, retention, and privacy.
- Authentication, authorization, secrets, abuse cases, and threat model.
- APIs, integrations, contracts, retries, rate limits, and failure handling.
- Offline, empty, loading, partial, timeout, and degraded states.
- Performance and scale targets.
- Browser, device, OS, and runtime support.
- Observability, analytics, logging, and alerts.
- Deployment, rollout, rollback, and backward compatibility.
- Testing depth and acceptance evidence.
- Documentation and handoff needs.
- Budget, time, token, dependency, and operational constraints.

### 9.3 Exit Criteria

For Standard work, default to no more than three focused interview rounds unless unresolved risk genuinely requires more. For Substantial work, continue until:

- Material decisions are resolved or explicitly deferred.
- The user intent can be restated without contradiction.
- Acceptance criteria are measurable.
- Remaining assumptions are listed and risk-rated.
- The Planner has high confidence that two competent executors would build materially the same result from the specification.

Then present a **Shared Understanding Summary** for correction.

---

## 10. Phase 3 — Create the Executor-Ready Plan

This phase applies to Standard and Substantial work. Trivial work uses the fast-loop goal, acceptance condition, and verification method without a formal plan document.

The plan must be detailed enough that an executor does not need to rediscover product intent or architecture.

### 10.1 Required Plan Sections

1. Project Completion Goal.
2. Shared Understanding Summary.
3. Current-state repository map.
4. Requirements and acceptance criteria.
5. Assumptions and unresolved decisions.
6. Non-goals.
7. Proposed architecture and key decisions.
8. Interfaces, contracts, schemas, and data flow.
9. Skill Manifest.
10. Context strategy using Ponytail, LeanCTX, and Graphify.
11. Phase breakdown.
12. Batch breakdown inside each phase.
13. Sub-agent assignments and ownership boundaries.
14. Dependency graph and parallelization map.
15. File or module change map.
16. Test strategy.
17. Visual validation strategy when applicable.
18. Security, privacy, performance, accessibility, and migration checks.
19. Rollout and rollback plan.
20. Risk register and mitigations.
21. Completion evidence checklist.

### 10.2 Task Quality Standard

Every planned task must define:

- Objective.
- Why it is needed.
- Preconditions.
- Inputs and relevant context.
- Owned files or modules.
- Interfaces it may change.
- Implementation constraints.
- Expected output.
- Acceptance criteria.
- Verification command or method.
- Dependencies.
- Rollback method.
- Whether it can run in parallel.
- Assigned agent role and recommended model capability.

Avoid tasks such as “implement backend” or “finish UI.” Break work into bounded, testable vertical slices.

### 10.3 Plan Granularity

Choose process depth from the triage tier:

- **Trivial:** no formal phase document. Use one bounded implementation batch and one verification/review checkpoint.
- **Standard:** normally 2–4 compact phases or vertical slices. Combine planning artifacts when possible.
- **Substantial:** normally 4–7 phases; use 7+ only when milestones, risk, or independent deployable slices justify them.

Do not split work merely to create more phases. Every phase must end with an integrated, reviewable checkpoint, and the cost of a phase must be lower than the risk it controls.

---

## 11. Phase 4 — Adversarial Plan Review

Apply review depth by tier:

- **Trivial:** skip separate pre-execution adversarial review; perform a mandatory post-change diff and edge-case review.
- **Standard:** run one compact pre-mortem or reviewer pass focused on the highest-risk assumptions.
- **Substantial:** do not execute the first draft of the plan. Assign one or more independent reviewers to attack it from different angles.

### 11.1 Required Review Lenses

- Requirement completeness.
- Architecture consistency.
- Dependency and sequencing errors.
- Hidden coupling and integration risk.
- Data integrity and migration risk.
- Security and privacy threats.
- Performance and scale failure modes.
- Accessibility and usability gaps.
- Browser, device, OS, and environment variance.
- Error, timeout, retry, rollback, and recovery behavior.
- Test blind spots.
- Visual failure states.
- Operational and deployment risk.
- Token and context waste.
- Unnecessary complexity under Ponytail principles.

### 11.2 Failure Pre-Mortem

Ask:

> Assume this project failed after implementation. What most likely caused the failure, and which plan change would have prevented it?

Rank risks by probability and impact. Update the plan before execution.

### 11.3 Plan Readiness Gate

For Standard and Substantial work, execution is allowed only when the plan is:

- Complete.
- Internally consistent.
- Sequenced.
- Testable.
- Rollback-aware.
- Skill-mapped.
- Parallelization-safe.
- Reviewed against edge cases.
- Traceable to the Project Completion Goal.

Default behavior is to present the final plan for explicit user approval. If the user has clearly authorized autonomous end-to-end execution, preserve a visible plan checkpoint and proceed only after the internal readiness gate passes.

---

## 12. Phase 5 — Execution Orchestration

### 12.1 No One-Shot Execution

Never implement a Standard or Substantial project in one pass. A Trivial task may use one bounded implementation pass only when followed by focused verification and final diff review.

Divide work into phases and small batches. A batch should normally be:

- One vertical slice, or
- A small set of independent tasks that can be integrated and verified together.

Prefer several reversible batches over one large irreversible batch.

### 12.2 Delegation and Parallelism

Delegate substantial work when it reduces wall-clock time, improves specialist quality, isolates context, or creates meaningfully independent review. Do not delegate when coordination and duplicated context cost more than direct execution.

Before launching work, record the capability mode from §4.5 and the maximum active sub-agent count from the token budget.

Parallelize tasks only when true concurrency is supported and tasks are independent across:

- Files or modules.
- Interfaces.
- Data state.
- Build state.
- Migrations.
- External resources.
- Generated artifacts.

Use a single integrator for shared interfaces and shared files.

Never allow two agents to unknowingly edit the same file or contract. When concurrency is unavailable, execute the same dependency graph sequentially rather than pretending the work occurred in parallel. If overlap is unavoidable:

1. Define edit regions or sequence explicitly.
2. Name the integrator.
3. Require reconciliation and regression checks.

### 12.3 Sub-Agent Work Order

Every sub-agent receives:

```markdown
## Assignment
- Goal:
- Scope:
- Explicit non-goals:
- Owned files/modules:
- Read-only dependencies:
- Required skills:
- Relevant decisions:
- Acceptance criteria:
- Verification commands:
- Output format:
- Token/context budget:
- Escalation conditions:
```

A sub-agent must return:

- Summary of work.
- Files changed.
- Decisions made.
- Tests and checks run with results.
- Risks, assumptions, and unresolved issues.
- Suggested integration checks.

Do not accept “done” without evidence.

### 12.4 Model Routing

- Use the strongest available model for planning, architecture, difficult debugging, security-sensitive work, and final review.
- Use capable lower-cost models for bounded, routine, low-risk tasks with precise acceptance criteria.
- Escalate to a stronger model when uncertainty, risk, or repeated failure increases.
- Do not use a weak model merely to save tokens when rework would cost more.
- Keep model choice proportional to task complexity and blast radius.

---

## 13. Mandatory Batch Loop

### 13.1 Trivial Fast Loop

A Trivial task uses this complete loop:

1. **Inspect:** read applicable instructions, target code, direct dependencies, and current git state.
2. **Change:** make the smallest correct edit under Ponytail rules.
3. **Verify:** run the most focused deterministic test, build check, or manual check that proves the acceptance condition.
4. **Review:** inspect the final diff for unintended changes, edge cases, debug artifacts, and scope creep; then report evidence.

Any failure, ambiguity, cross-component impact, or risk increase triggers reclassification.

### 13.2 Standard and Substantial Batch Loop

Standard work may combine adjacent steps below when the evidence remains explicit. Substantial work follows every step separately.

### Step 1 — Define

Record:

- Batch goal.
- Included tasks.
- Excluded tasks.
- Assigned agents.
- Files and interfaces owned.
- Dependencies.
- Expected evidence.
- Rollback point.

### Step 2 — Establish Baseline

- Confirm git state.
- Run relevant existing tests or checks.
- Record pre-existing failures separately.
- Create a checkpoint or recoverable state.

### Step 3 — Execute According to Capability Mode

- In `concurrent` mode, launch independent isolated sub-agents concurrently up to the budgeted limit.
- In `sequential` mode, run specialized work packages in dependency order without claiming parallel speedup.
- In `single-agent` mode, execute bounded packages one at a time with checkpoints and compact context handoffs.
- Keep shared interface changes centralized.
- Use focused context packages.
- Enforce Ponytail minimal-diff behavior.

### Step 4 — Sub-Agent Self-Check

Each sub-agent must:

- Review its own diff.
- Run assignment-specific tests.
- Check edge cases.
- Remove debug code and accidental changes.
- Confirm acceptance criteria.

### Step 5 — Integrate

The Executor must:

- Review each returned diff.
- Resolve conflicts deliberately.
- Check contract compatibility.
- Refresh Graphify when structure changed.
- Update LeanCTX memory and the decision ledger.

### Step 6 — Verify the Integrated Batch

Run applicable checks:

- Formatting and linting.
- Type checking.
- Unit tests.
- Integration tests.
- Contract tests.
- Build or compile.
- Database and migration validation.
- Security checks.
- Performance smoke tests.
- Accessibility checks.
- Browser or visual tests.
- Manual critical-path validation.

### Step 7 — Review

Use an independent reviewer to inspect:

- Requirement alignment.
- Diff quality.
- Unintended changes.
- Missing tests.
- Edge cases.
- Regression risk.
- Unnecessary complexity.

### Step 8 — Decide

Choose one:

- **PASS:** checkpoint and continue.
- **REWORK:** repair within the same batch and re-run verification.
- **REPLAN:** stop execution, update the plan, and repeat plan review.
- **ROLLBACK:** revert the batch and document why.

### Step 9 — Update the Ledger

Record:

- Completed acceptance criteria.
- Evidence produced.
- Files and interfaces changed.
- New risks or decisions.
- Test status.
- Remaining work.
- Context summary for the next batch.

Do not begin the next batch until the current batch passes.

---

## 14. Testing Strategy

Testing must be planned, not appended at the end.

Use the most relevant combination of:

- Unit tests for local logic.
- Integration tests for component boundaries.
- Contract tests for APIs and schemas.
- End-to-end tests for critical user journeys.
- Regression tests for fixed bugs.
- Migration tests for data changes.
- Property or fuzz tests for high-risk input spaces.
- Security tests for trust boundaries.
- Performance tests for explicit targets.
- Accessibility checks for user interfaces.
- Visual regression checks for websites and UI.

For bug fixes:

1. Reproduce the bug.
2. Add or identify a failing regression test.
3. Apply the smallest correct fix.
4. Prove the test now passes.
5. Check adjacent behavior.

Do not weaken or delete valid tests merely to obtain a green run.

---

## 15. Visual and Browser Validation

For websites, applications, design systems, or visual outputs, visual checking is mandatory.

Validate at least:

- Primary user journeys.
- Loading, empty, error, partial, success, and disabled states.
- Mobile, tablet, and desktop layouts as applicable.
- Target browsers and devices.
- Keyboard navigation.
- Focus states.
- Color contrast and text scaling.
- Overflow, clipping, alignment, spacing, and responsive behavior.
- Console errors and failed network requests.
- Screenshots or visual diffs against approved references where available.

A build passing is not evidence that the UI is correct.

---

## 16. Full-Project Final Review

This section is mandatory for Standard and Substantial work. Trivial work uses the final review in §13.1 unless it is reclassified.

After all batches pass, perform a fresh review of the integrated project rather than merely combining prior batch reports.

### 16.1 Requirements Traceability

Create a table:

| Requirement / acceptance criterion | Implementation location | Verification | Result | Evidence |
|---|---|---|---|---|

Every requirement must be accounted for.

### 16.2 Required Final Checks

Run all applicable checks from a clean state:

- Dependency installation or lockfile integrity.
- Formatting.
- Linting.
- Type checking.
- Full test suite.
- Production build.
- End-to-end critical paths.
- Database migrations and rollback path.
- Security and secret scan.
- Dependency vulnerability review.
- Performance targets.
- Accessibility.
- Browser and visual validation.
- Logs, metrics, and observability.
- Documentation accuracy.
- Dead code and debug artifact inspection.
- Git diff and untracked file review.
- Clean-environment or fresh-clone verification when practical.

### 16.3 Independent Final Review

Assign an independent reviewer to inspect the whole result for:

- Missing requirements.
- Cross-batch integration errors.
- Regressions.
- Inconsistent patterns.
- Unnecessary complexity.
- Security or privacy gaps.
- Weak error handling.
- Missing tests.
- Documentation drift.
- Visual defects.

Fix material findings in additional bounded batches and re-run affected checks.

---

## 17. Definition of Done

The project is complete only when:

- The Project Completion Goal is satisfied.
- All accepted requirements are implemented.
- Every acceptance criterion has evidence.
- All planned batches passed their gates.
- Full-project checks pass, or documented pre-existing failures are clearly separated and accepted.
- Critical and high-severity findings are fixed.
- No unresolved material regression is known.
- UI work has been visually checked where applicable.
- Security, privacy, performance, accessibility, migration, deployment, and rollback requirements have been addressed where applicable.
- Documentation matches the actual implementation.
- The final diff contains no unrelated changes, secrets, debug artifacts, or accidental generated files.
- The user receives a concise final report with limitations stated honestly.

“Implemented” is not the same as “done.”

---

## 18. Token and Context Optimization

High quality with fewer tokens requires disciplined information flow, not shallow reasoning.

### 18.1 Context Rules

- Query Graphify before broad repository reading.
- Use LeanCTX for focused reads, compressed outputs, caching, and project memory.
- Apply Ponytail to reduce unnecessary implementation and discussion.
- Delegate repository exploration and return only relevant paths, line ranges, interfaces, and conclusions.
- Keep raw logs outside the main context; retain summaries and links or file locations.
- Do not repeatedly paste unchanged plans, code, or logs.
- Use structured ledgers for decisions, risks, requirements, and evidence.
- Compact completed phases while preserving unresolved items and immutable decisions.
- Load skills progressively only when needed.
- Prefer tool calls and tests over speculative discussion.
- Stop agents that are duplicating work or exploring outside scope.

### 18.2 Hard Cost and Token Budget Gate

Set a budget **before execution**. A user-specified monetary or token ceiling is hard and has priority. When exact accounting is available, track incremental task usage excluding fixed platform/system context where the harness reports it separately.

Record this budget block in the plan or task ledger:

```yaml
budget:
  max_cost: <currency amount or null>
  max_incremental_tokens: <number or null>
  max_high_capability_model_calls: <number>
  max_subagent_sessions: <number>
  max_concurrent_subagents: <number>
  max_skill_installs: <number>
  max_retry_cycles_per_batch: <number>
  reserve_percent_for_verification: <number>
```

Default ceilings when the user has not supplied a budget:

| Tier | Incremental token ceiling* | High-capability calls | Sub-agent sessions | New skill installs | Retry cycles |
|---|---:|---:|---:|---:|---:|
| Trivial | 12,000 | 0 | 0 | 0 | 1 |
| Standard | 60,000 | 2 | 3 | 2 | 2 |
| Substantial | Must be proposed in the plan; never assume unlimited | Set explicitly | Set explicitly | Set explicitly | Set explicitly |

\*Use the closest available accounting proxy when the harness does not expose token usage. Proxy limits include model calls, agent sessions, files loaded, broad searches, skill installations, and retries.

Budget rules:

- Reserve at least 20% of the budget for testing, integration, and final review.
- Spend high-capability calls on planning, architecture, difficult debugging, security-sensitive work, or final review—not routine edits.
- Stop duplicate exploration immediately.
- A budget is not permission to skip required safety or correctness checks.
- Before exceeding any ceiling, stop and choose one: reduce scope, compress context, use a cheaper capable model, merge work packages, re-plan, or request an explicit budget increase.
- Never silently exceed a hard user budget.
- If the remaining budget cannot safely complete and verify the task, report the partial state and blocker rather than claiming completion.

---

## 19. Change Control and Safety

- Preserve user data and existing behavior unless the accepted plan explicitly changes them.
- Treat destructive commands, migrations, deployment, billing, credentials, production data, and external side effects as high risk.
- Use dry runs, backups, feature flags, reversible migrations, and staged rollout where applicable.
- Never expose secrets in prompts, logs, commits, screenshots, or reports.
- Do not execute downloaded scripts without inspection.
- Do not modify unrelated files.
- Do not silently expand scope.
- Stop and escalate when requirements conflict with security, law, platform policy, or irreversible risk.

---

## 20. Required Working Artifacts

Create only the artifacts justified by the triage tier:

| Tier | Required artifacts |
|---|---|
| Trivial | None. Keep the goal, test evidence, and final diff review in the task response or existing issue. |
| Standard | Prefer one compact `PLAN.md` or existing issue containing goal, decisions, tasks, skill list, budget, and verification evidence. |
| Substantial | Use separate artifacts when they improve coordination: `PROJECT_GOAL.md`, `PLAN.md`, `DECISIONS.md`, `SKILLS.md`, `EXECUTION_LOG.md`, and `REVIEW.md`. Combine any of them when separation adds no value. |

Never create tracking files solely to satisfy ceremony. Existing project-management systems, issues, pull requests, or design documents may replace these files when they preserve the same information.

---

## 21. Standard Plan Template

```markdown
# Project Plan

## 1. Project Completion Goal

## 2. Shared Understanding

## 3. Current State

## 4. Requirements

## 5. Acceptance Criteria

## 6. Non-Goals

## 7. Assumptions and Open Decisions

## 8. Architecture and Key Decisions

## 9. Interfaces, Data, and Contracts

## 10. Skill Manifest

## 11. Context Strategy
- Ponytail:
- LeanCTX:
- Graphify:

## 12. Dependency and Parallelization Map

## 13. Phases

### Phase N — [Name]
- Outcome:
- Preconditions:
- Batches:
- Agents:
- Files/modules:
- Skills:
- Verification:
- Exit criteria:
- Rollback:

## 14. Test Strategy

## 15. Visual Validation

## 16. Security, Privacy, Performance, and Accessibility

## 17. Deployment and Rollback

## 18. Risk Register

## 19. Completion Evidence
```

---

## 22. Standard Batch Record

```markdown
# Batch [ID] — [Name]

## Goal

## Included / Excluded

## Assignments

| Agent | Scope | Owned files/modules | Dependencies | Verification |
|---|---|---|---|---|

## Baseline

## Execution Results

## Integrated Verification

## Reviewer Findings

## Decision
PASS / REWORK / REPLAN / ROLLBACK

## Evidence

## Ledger Update
```

---

## 23. Final Delivery Format

The final report must be concise but complete:

```markdown
# Delivery Report

## Outcome
- What was delivered:
- Goal status:

## Major Changes
- ...

## Verification
| Check | Result | Evidence |
|---|---|---|

## Requirement Coverage
- X of Y acceptance criteria passed.

## Known Limitations
- ...

## Deployment / Rollback Notes
- ...

## Files and Documentation
- ...
```

Never hide failed checks or unresolved limitations.

---

## 24. Immediate Stop Conditions

Stop execution and return to planning when:

- The implementation conflicts with the accepted user intent.
- A critical assumption is disproved.
- A shared interface must change outside the plan.
- A migration or destructive operation is riskier than planned.
- Security or privacy risk increases materially.
- Parallel agents create conflicting architecture or edits.
- Tests reveal a broader regression.
- The current batch cannot be safely rolled back.
- The plan no longer describes the actual work.
- A hard monetary, token, model-call, sub-agent, skill-install, or retry ceiling is about to be exceeded.

Replanning is correct behavior, not failure.

---

## 25. Core Principle

**Triage first. Understand deeply. Plan in proportion to risk. Delegate only when it pays. Execute in controlled batches. Verify with evidence. Prove completion.**
