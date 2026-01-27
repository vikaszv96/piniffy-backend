export function errorHandler(err, req, res, next) {
  console.error(err.response?.data || err.message);

  res.status(500).json({
    error: 'Internal Server Error',
    message: err.response?.data || err.message
  });
}
