// Express 4 does not forward rejected promises from async handlers to the error middleware (Express 5 does).
export const asyncHandler = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
