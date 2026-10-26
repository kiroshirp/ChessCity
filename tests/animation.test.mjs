import test from "node:test";
import assert from "node:assert/strict";
import {
  constructionTimeline,
  ANIMATION_DURATION,
} from "../.sites-runtime/tests/construction-timeline.mjs";
test("construction grows, demolition shrinks and both stop rendering when finished", () => {
  assert.equal(constructionTimeline("construction", 0).progress, 0);
  assert.equal(constructionTimeline("upgrade", ANIMATION_DURATION).progress, 1);
  assert.equal(constructionTimeline("demolition", 0).progress, 1);
  assert.equal(
    constructionTimeline("demolition", ANIMATION_DURATION).progress,
    0,
  );
  assert.equal(
    constructionTimeline("construction", ANIMATION_DURATION).done,
    true,
  );
  assert.equal(constructionTimeline("demolition", -1000).progress, 1);
});
test("reduced motion goes directly to the final state", () => {
  assert.deepEqual(constructionTimeline("demolition", 100, true), {
    done: true,
    progress: 0,
    swing: 0,
    dust: 0,
  });
  assert.equal(constructionTimeline("construction", 100, true).progress, 1);
});
