export default function handler(_req, res) {
  res.status(200).json({
    user: null,
    tasks: [],
    courses: [],
    schedule: [],
    bills: [],
    budget: { income: 0, spent: 0, saved: 0, left: 0 },
    paychecks: [],
    constraints: {
      hard: {
        lockClasses: true,
        lockWorkShifts: true,
        protectRecoveryBlocks: true,
        minSleepHours: 7,
        windDownHour: 22,
        maxFocusBlockMinutes: 90,
      },
      soft: {
        morningFocusBias: 4,
        lowEnergyProtection: 5,
        keepEveningLight: 4,
        protectFutureWork: 3,
        batchShallowWork: 3,
      },
    },
    sourceMeta: {
      calendar: { configured: false, lastSyncAt: null, lastError: "", eventCount: 0 },
      lms: { configured: false, lastSyncAt: null, lastError: "", courseCount: 0, assignmentCount: 0 },
      webhookCount: 0,
    },
  });
}
