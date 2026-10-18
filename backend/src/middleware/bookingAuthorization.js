
function authorizeBookingAccess(req, res, next) {
  const user = req.user;
  const booking = req.booking;

  if (!user || user.user_id == null) {
    return res.status(401).json({
      error: 'AUTHENTICATION_REQUIRED',
      message: 'Authentication required.',
    });
  }

  if (!booking) {
    return res.status(404).json({
      error: 'BOOKING_NOT_FOUND',
      message: 'Booking not found.',
    });
  }

  const isAdmin =
    typeof user.role === 'string' &&
    user.role.toUpperCase() === 'ADMIN';

  const isOwner =
    booking.user_id != null &&
    String(booking.user_id) === String(user.user_id);

  if (!isOwner && !isAdmin) {
    return res.status(403).json({
      error: 'FORBIDDEN',
      message: 'You are not authorized to access this booking.',
    });
  }

  return next();
}

module.exports = { authorizeBookingAccess };
