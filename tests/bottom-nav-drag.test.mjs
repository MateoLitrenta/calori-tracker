import assert from 'node:assert/strict';
import test from 'node:test';
import { navDragDestination, navDragPose, startedNavDrag } from '../src/lib/bottomNavDrag.ts';

test('the gesture slop separates taps from short horizontal or vertical drags', () => {
  assert.equal(startedNavDrag(3, 4), false);
  assert.equal(startedNavDrag(6, 0), true);
  assert.equal(startedNavDrag(0, -6), true);
  assert.equal(navDragDestination(1, 80, 3, 35, 0), 1);
  assert.equal(navDragDestination(1, 80, 3, 36, 0), 2);
  assert.equal(navDragDestination(1, 80, 3, 0, -160), 1);
});

test('a diagonal changes tab only with a dominant horizontal component and stays within the track', () => {
  assert.equal(navDragDestination(1, 80, 3, 50, -40), 1);
  assert.equal(navDragDestination(1, 80, 3, 51, -40), 2);
  assert.equal(navDragDestination(2, 90, 3, -42, -5), 1);
  assert.equal(navDragDestination(0, 80, 3, 190, 3), 2);
  assert.equal(navDragDestination(1, 100, 3, 800, 1), 3);
  assert.equal(navDragDestination(1, 100, 3, -800, 1), 0);
});

test('the indicator follows pointer pixels in the track and resists both edges and vertical pull', () => {
  const inside = navDragPose(80, 240, 25, 0);
  assert.equal(inside.x, 105);
  assert.equal(inside.y, 0);
  assert.ok(inside.scaleX > 1 && inside.scaleY < 1);
  const medium = navDragPose(80, 240, 0, -36);
  const long = navDragPose(80, 240, 0, -180);
  assert.ok(long.y < medium.y && medium.y < 0 && long.y > -3);
  assert.ok(medium.scaleY > 1 && medium.scaleX < 1);
  const left = navDragPose(0, 240, -5000, 5000);
  const right = navDragPose(240, 240, 5000, -5000);
  assert.ok(left.x < 0 && left.x > -2);
  assert.ok(right.x > 240 && right.x < 242);
  assert.ok(left.y < 3 && right.y > -3);
  assert.ok(left.scaleX <= 1.018 && right.scaleY >= .991);
});
