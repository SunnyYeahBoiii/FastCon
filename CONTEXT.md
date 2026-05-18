# FastCons Contest Evaluation

FastCons manages contest submissions, asynchronous judging, leaderboard ranking, and per-user submission quota windows.

## Language

**Contest**:
An evaluation task that accepts contestant submissions and may define a deadline, status, and daily submission limit.

**Submission**:
One uploaded file from one contestant for one contest, judged asynchronously after it is accepted by the system.
_Avoid_: Attempt, upload

**Graded Submission**:
A submission whose judge run completed with status `graded` and a non-null score.
_Avoid_: Successful upload, accepted file

**Failed Submission**:
A submission whose judge run ended in `failed`, usually because evaluation code, ground truth, timeout, or submitted file processing failed.
_Avoid_: Rejected submission

**Contestant User**:
A participant account that represents a competing team in the current contest workflow.
_Avoid_: Separate team

**Leaderboard Score**:
The score shown for a contestant user in a contest, derived from that user's latest graded submission for that contest.
_Avoid_: Best score, max score

**Leaderboard Submission Count**:
The number of graded submissions for a user in a contest, shown as `Số lần nộp` on the leaderboard.
_Avoid_: Quota used

**Submission Quota Window**:
A per-user, per-contest rolling 24-hour limit window for accepted submissions.
_Avoid_: Leaderboard count

**Used Quota**:
The number of submissions in the active submission quota window whose quota usage state is `pending` or `counted`.
_Avoid_: Leaderboard submission count

**Quota Usage State**:
The quota accounting state attached to a submission: `pending`, `counted`, or `refunded`.
_Avoid_: Submission status

**Admin Rejudge**:
An admin action that queues an existing completed submission for another judge run without changing its quota usage state.
_Avoid_: New submission

## Relationships

- A **Contest** has zero or more **Submissions**
- A **Contest** has zero or more **Submission Quota Windows**
- A **Submission** belongs to exactly one **Contest** and exactly one **User**
- A **Submission Quota Window** belongs to exactly one **Contest** and exactly one **User**
- A **Contestant User** is the leaderboard identity for a competing team in the current workflow
- A **Leaderboard Score** is derived from the latest **Graded Submission** for a **Contestant User** in a **Contest**, not the highest historical score
- A **Leaderboard Submission Count** is derived from **Graded Submissions**, not **Failed Submissions**
- **Used Quota** is derived from **Quota Usage State** within the active **Submission Quota Window**
- A newly accepted **Submission** starts with `pending` **Quota Usage State**
- A first judge result changes `pending` to `counted` for **Graded Submissions** or `refunded` for **Failed Submissions**
- **Admin Rejudge** does not change **Quota Usage State**

## Example Dialogue

> **Dev:** "Should a failed judge run increase the user's leaderboard submission count?"
> **Domain expert:** "No. Leaderboard count is the number of submissions that were graded."
>
> **Dev:** "Should that same failed judge run consume quota?"
> **Domain expert:** "No — failed submissions are refunded, but in-flight submissions still count until they finish."
>
> **Dev:** "If an admin rejudges a refunded submission and it later grades successfully, should it consume quota?"
> **Domain expert:** "No. Rejudge is an admin action, not a new contestant submission."
>
> **Dev:** "If a team scores 95, then later submits a graded 80, what score appears on the leaderboard?"
> **Domain expert:** "80. The leaderboard score is the latest graded submission score, not the best score."

## Flagged Ambiguities

- "Số lần nộp" has been used for both **Leaderboard Submission Count** and **Used Quota**. Use **Leaderboard Submission Count** for the public ranking value and **Used Quota** for the limiter.
