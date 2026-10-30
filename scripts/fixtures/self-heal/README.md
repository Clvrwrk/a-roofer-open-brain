# Self-healing acceptance fixture

Isolated synthetic fixture for the explicitly authorized Sentry → Linear → agent → draft PR drill.
It is never imported by any production application or sync. Missing heartbeat timestamps should
be stale; the fixture currently demonstrates the defect. The fixing agent must add a failing
reproduction, make the minimal fix, pass the full verification chain and open a draft PR.
Keep the resulting automated proposal unmerged for human review.
