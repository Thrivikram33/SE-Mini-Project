const express = require('express')
const { requireRole } = require('../middleware/authMiddleware')
const { createAdminManagementService } = require('../services/adminManagementService')

const router = express.Router()
const adminService = createAdminManagementService()

router.use('/admin', requireRole('ADMIN'))

function handleError(error, res, next) {
  if (Number.isInteger(error.statusCode) && error.statusCode >= 400 && error.statusCode < 500) {
    return res.status(error.statusCode).json({
      error: error.code || 'REQUEST_FAILED',
      message: error.message,
      ...(error.details ? { details: error.details } : {}),
    })
  }
  return next(error)
}

function endpoint(handler, status = 200) {
  return async (req, res, next) => {
    try {
      const result = await handler(req)
      return res.status(status).json(result)
    } catch (error) {
      return handleError(error, res, next)
    }
  }
}

router.get('/admin/stations', endpoint(() => adminService.listStations().then((stations) => ({ stations }))))
router.get('/admin/trains', endpoint(() => adminService.listTrains().then((trains) => ({ trains }))))
router.post('/admin/trains', endpoint((req) => adminService.createTrain(req.session.user.userId, req.body).then((train) => ({ train })), 201))
router.put('/admin/trains/:trainId', endpoint((req) => adminService.updateTrain(req.session.user.userId, req.params.trainId, req.body).then((train) => ({ train }))))

router.get('/admin/schedules', endpoint(() => adminService.listSchedules().then((schedules) => ({ schedules }))))
router.post('/admin/schedules', endpoint((req) => adminService.createSchedule(req.session.user.userId, req.body).then((schedule) => ({ schedule })), 201))
router.put('/admin/schedules/:scheduleId', endpoint((req) => adminService.updateSchedule(req.session.user.userId, req.params.scheduleId, req.body).then((schedule) => ({ schedule }))))

router.get('/admin/schedules/:scheduleId/fares', endpoint((req) => adminService.listFares(req.params.scheduleId).then((fares) => ({ fares }))))
router.put('/admin/schedules/:scheduleId/fares/:classType', endpoint((req) => adminService.saveFare(
  req.session.user.userId,
  req.params.scheduleId,
  { ...req.body, classType: req.params.classType },
).then((fare) => ({ fare }))))

router.get('/admin/schedules/:scheduleId/inventory', endpoint((req) => adminService.listInventory(req.params.scheduleId).then((coaches) => ({ coaches }))))
router.post('/admin/schedules/:scheduleId/coaches', endpoint((req) => adminService.addCoach(
  req.session.user.userId,
  req.params.scheduleId,
  req.body,
).then((coach) => ({ coach })), 201))
router.put('/admin/seats/:seatId', endpoint((req) => adminService.updateSeat(
  req.session.user.userId,
  req.params.seatId,
  req.body,
).then((seat) => ({ seat }))))

module.exports = router
