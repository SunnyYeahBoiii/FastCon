import assert from "node:assert/strict";
import test from "node:test";

import {
  REJUDGE_ELIGIBLE_STATUSES,
  hasEvaluateCodeChanged,
} from "../lib/evaluateCodeRejudge";

test("rejudge policy targets only completed submissions", () => {
  assert.deepEqual(REJUDGE_ELIGIBLE_STATUSES, ["graded", "failed"]);
});

test("evaluate code changes are compared by stored value", () => {
  assert.equal(hasEvaluateCodeChanged(null, null), false);
  assert.equal(hasEvaluateCodeChanged("return 1", "return 1"), false);
  assert.equal(hasEvaluateCodeChanged(null, ""), true);
  assert.equal(hasEvaluateCodeChanged("return 1", "return 2"), true);
});
