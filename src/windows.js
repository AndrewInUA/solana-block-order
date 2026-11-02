/**
 * Leader windows. A leader is assigned runs of consecutive slots (4 on Agave).
 * We group a validator's leader slots into those runs, because a single block is
 * built per slot but the validator controls the whole window, and aiming at the
 * first slot of a window gives our probes the best chance to be seen.
 */

function groupWindows(leaderSlots, slotsPerWindow) {
  const size = slotsPerWindow || 4;
  const sorted = [...leaderSlots].sort((a, b) => a - b);
  const windows = [];
  let current = [];
  for (const slot of sorted) {
    if (current.length === 0 || slot === current[current.length - 1] + 1) {
      current.push(slot);
    } else {
      windows.push(current);
      current = [slot];
    }
    if (current.length === size) {
      windows.push(current);
      current = [];
    }
  }
  if (current.length) windows.push(current);
  return windows;
}

/**
 * Future windows only, with a lead-time buffer so there is time to send before
 * the window opens. currentSlot is the chain tip; leadSlots is how many slots of
 * head start we want.
 */
function futureWindows(leaderSlots, currentSlot, slotsPerWindow, leadSlots) {
  const lead = leadSlots || 2;
  return groupWindows(leaderSlots, slotsPerWindow).filter(w => w[0] > currentSlot + lead);
}

module.exports = { groupWindows, futureWindows };
