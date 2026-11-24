-- Empty-DB fixture: no rows. Effectively a no-op since the harness already
-- truncates all user tables before loading fixtures, but referencing this
-- explicitly in a test case makes the test's expectation about starting
-- state visible at the call site.
SELECT 1;
