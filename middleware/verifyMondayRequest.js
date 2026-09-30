const jwt = require('jsonwebtoken');

function verifyMondayRequest(req, res, next) {
  //console.log('### verifyMondayRequest called ###');
  //console.log('### DEV_BYPASS_AUTH:', process.env.DEV_BYPASS_AUTH);
  //console.log('### Authorization header:', req.headers.authorization);

  if (process.env.DEV_BYPASS_AUTH === 'true') {
    console.warn('[dev bypass] Skipping monday JWT verification.');
    return next();
  }

  const token = req.headers.authorization;

  if (!token) {
    console.log('### REJECTING: no Authorization header');
    return res.status(401).json({ error: 'Missing Authorization header' });
  }

  try {
    const decoded = jwt.verify(token, process.env.MONDAY_SIGNING_SECRET);
    req.mondayContext = decoded;
    return next();
  } catch (err) {
    console.log('### REJECTING: JWT verify failed:', err.message);
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

module.exports = verifyMondayRequest;