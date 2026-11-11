'use strict'

function isWithinMaintenance(timestamp, windows = []) {
  const instant = new Date(timestamp).getTime()
  if (!Number.isFinite(instant)) return false

  return windows.some((window) => {
    const start = new Date(window.start).getTime()
    const end = new Date(window.end).getTime()
    return Number.isFinite(start) && Number.isFinite(end) &&
      end > start && instant >= start && instant < end
  })
}

function summarizeAvailability(observations, options = {}) {
  const windows = Array.isArray(options.plannedMaintenance)
    ? options.plannedMaintenance
    : []

  const eligible = observations.filter((observation) =>
    observation &&
    typeof observation.timestamp === 'string' &&
    typeof observation.success === 'boolean' &&
    !isWithinMaintenance(observation.timestamp, windows),
  )

  const total = eligible.length
  const successful = eligible.filter((observation) => observation.success).length
  const failed = total - successful
  const percentage = total === 0 ? null : (successful / total) * 100

  return {
    totalProbes: total,
    successfulProbes: successful,
    failedProbes: failed,
    plannedMaintenanceWindows: windows.length,
    availabilityPercentage: percentage === null
      ? null
      : Number(percentage.toFixed(3)),
    targetPercentage: 99,
    targetMet: percentage !== null && percentage >= 99,
    measurement: 'successful health probes / eligible health probes',
  }
}

module.exports = { isWithinMaintenance, summarizeAvailability }
