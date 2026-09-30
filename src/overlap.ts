import { timeToMinutes } from './dateMath'
import type { CalItem } from './items'

/**
 * Lane layout for overlapping timed blocks — the Apple Calendar behaviour.
 *
 * A day column is split only where events actually collide: transitively
 * overlapping events form a cluster, each gets the leftmost free lane, and then
 * widens back to the right across every lane nothing of its own overlaps sits
 * in. A 09:00–17:00 block beside one 30-minute stand-up therefore keeps almost
 * the whole column instead of losing half of it to empty space.
 *
 * Pure arithmetic on purpose: the grid measures nothing, so this is unit-tested
 * rather than reasoned about in the DOM.
 */

/** Horizontal geometry for one block, as fractions of its day column. */
export interface BlockLayout {
  /** Left edge, 0–1 of the column. */
  left: number
  /** Width, 0–1 of the column. */
  width: number
  /** Paint order within the column — a lane that laps its neighbour sits above it. */
  z: number
}

/** An item with no end occupies an hour — the same rule the grid paints with. */
const DEFAULT_SPAN_MIN = 60
/** Nothing collides on less than this, so a zero-length event still takes a lane. */
const MIN_SPAN_MIN = 5
/**
 * How far a lapping lane reaches back over the lane before it, as a fraction of
 * one lane. Deliberately small: enough that the block reads as *in front of* its
 * neighbour rather than merely beside it, not enough to cover a title.
 */
const SHINGLE = 0.22

interface Span {
  id: string
  start: number
  end: number
  /** Input position — the last tiebreak, so the result never depends on sort stability. */
  order: number
}

function toSpans(items: readonly CalItem[]): Span[] {
  const spans: Span[] = []
  items.forEach((item, order) => {
    if (!item.startTime) return
    const start = timeToMinutes(item.startTime)
    const end = item.endTime ? timeToMinutes(item.endTime) : start + DEFAULT_SPAN_MIN
    spans.push({ id: item.id, start, end: Math.max(end, start + MIN_SPAN_MIN), order })
  })
  // Earliest first, then longest first: the block that spans the others takes
  // lane 0, which is what keeps the containing event on the left.
  return spans.sort((a, b) => a.start - b.start || b.end - a.end || a.order - b.order)
}

function overlaps(a: Span, b: Span): boolean {
  return a.start < b.end && b.start < a.end
}

/** Is `lane` free for the whole of `span`? */
function laneFree(cluster: readonly Span[], lanes: Map<string, number>, lane: number, span: Span): boolean {
  return !cluster.some(
    (other) => other.id !== span.id && lanes.get(other.id) === lane && overlaps(other, span)
  )
}

function placeCluster(cluster: readonly Span[], out: Map<string, BlockLayout>): void {
  // Greedy: the first lane whose last block has already ended.
  const laneEnd: number[] = []
  const lanes = new Map<string, number>()
  for (const span of cluster) {
    let lane = laneEnd.findIndex((end) => end <= span.start)
    if (lane === -1) lane = laneEnd.length
    laneEnd[lane] = span.end
    lanes.set(span.id, lane)
  }

  const count = laneEnd.length
  if (count === 1) {
    for (const span of cluster) out.set(span.id, { left: 0, width: 1, z: 1 })
    return
  }

  const unit = 1 / count
  for (const span of cluster) {
    const lane = lanes.get(span.id) ?? 0
    let width = 1
    while (lane + width < count && laneFree(cluster, lanes, lane + width, span)) width++
    // Lane 0 has nothing to its left to lap.
    const overhang = lane > 0 ? SHINGLE * unit : 0
    out.set(span.id, {
      left: lane * unit - overhang,
      width: width * unit + overhang,
      z: lane + 1
    })
  }
}

/**
 * Geometry for every timed item in **one day**, keyed by item id. Items with no
 * `startTime` are skipped — they belong to the all-day strip, not the grid.
 */
export function layoutOverlaps(items: readonly CalItem[]): Map<string, BlockLayout> {
  const out = new Map<string, BlockLayout>()
  let cluster: Span[] = []
  let clusterEnd = -1

  const flush = (): void => {
    if (cluster.length > 0) placeCluster(cluster, out)
    cluster = []
    clusterEnd = -1
  }

  for (const span of toSpans(items)) {
    // Sorted by start, so a span starting at or after everything seen so far
    // cannot touch this cluster — nor any later one.
    if (cluster.length > 0 && span.start >= clusterEnd) flush()
    cluster.push(span)
    clusterEnd = Math.max(clusterEnd, span.end)
  }
  flush()
  return out
}
