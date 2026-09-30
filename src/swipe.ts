// Trackpad swipe paging for the calendar (pure, unit-tested).

const SWIPE_THRESHOLD_PX = 60
export const SWIPE_IDLE_MS = 80
const COAST_FRAMES = 3
const COAST_RATIO = 0.5
const RESWIPE_GROWTH_PX = 6
const RESWIPE_CONFIRM_GROWTH_PX = 3

export interface CalendarSwipeGesture {
  /** Accumulated horizontal delta building toward the step threshold. */
  acc: number
  fired: boolean
  peak: number
  lastAbsX: number
  decayFrames: number
  coasting: boolean
  reswipeAcc: number
  reswipeLastAbsX: number
}

export function newSwipeGesture(): CalendarSwipeGesture {
  return {
    acc: 0,
    fired: false,
    peak: 0,
    lastAbsX: 0,
    decayFrames: 0,
    coasting: false,
    reswipeAcc: 0,
    reswipeLastAbsX: 0
  }
}

/**
 * One wheel event → at most one calendar step, momentum-aware.
 *
 * A trackpad fling is a burst followed by a momentum tail. A single growing
 * tail frame is noise; two growing frames after the tail is clearly coasting
 * are fingers back on the glass and immediately begin the next swipe.
 */
export function calendarSwipeStep(
  gesture: CalendarSwipeGesture,
  deltaX: number,
  deltaY: number
): { gesture: CalendarSwipeGesture; step: -1 | 0 | 1 } {
  // Vertical-dominant frames are content scrolling — ignore them without
  // disturbing the horizontal gesture (a real swipe burst contains incidental
  // vertical frames; resetting on those would let the burst double-fire).
  if (Math.abs(deltaX) <= Math.abs(deltaY)) return { gesture, step: 0 }
  const absX = Math.abs(deltaX)

  if (gesture.fired) {
    if (gesture.reswipeAcc !== 0) {
      const sameDirection = Math.sign(gesture.reswipeAcc) === Math.sign(deltaX)
      const confirmed = sameDirection && absX >= gesture.reswipeLastAbsX + RESWIPE_CONFIRM_GROWTH_PX
      if (confirmed) {
        const acc = gesture.reswipeAcc + deltaX
        if (Math.abs(acc) >= SWIPE_THRESHOLD_PX) {
          return {
            gesture: {
              ...newSwipeGesture(),
              fired: true,
              peak: absX,
              lastAbsX: absX
            },
            step: acc > 0 ? 1 : -1
          }
        }
        return {
          gesture: { ...newSwipeGesture(), acc, peak: absX, lastAbsX: absX },
          step: 0
        }
      }
    }

    const peak = Math.max(gesture.peak, absX)
    const decayFrames = absX < gesture.lastAbsX ? gesture.decayFrames + 1 : 0
    const coasting = gesture.coasting || (decayFrames >= COAST_FRAMES && absX < peak * COAST_RATIO)
    const growing = coasting && absX >= gesture.lastAbsX + RESWIPE_GROWTH_PX
    return {
      gesture: {
        ...gesture,
        peak,
        lastAbsX: absX,
        decayFrames,
        coasting,
        reswipeAcc: growing ? deltaX : 0,
        reswipeLastAbsX: growing ? absX : 0
      },
      step: 0
    }
  }

  const sameDirection = Math.sign(gesture.acc) === Math.sign(deltaX)
  const acc = (sameDirection ? gesture.acc : 0) + deltaX
  if (Math.abs(acc) < SWIPE_THRESHOLD_PX) {
    return {
      gesture: { ...gesture, acc, peak: Math.max(gesture.peak, absX), lastAbsX: absX },
      step: 0
    }
  }
  return {
    gesture: { ...newSwipeGesture(), fired: true, peak: absX, lastAbsX: absX },
    step: acc > 0 ? 1 : -1
  }
}
