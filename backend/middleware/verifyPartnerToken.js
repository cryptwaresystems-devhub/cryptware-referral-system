import jwt from 'jsonwebtoken';

export const verifyPartnerToken = (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        message: 'Authorization token missing or invalid.'
      });
    }

    const token = authHeader.split(' ')[1];

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.partner = decoded; // attach decoded data (id, email, role)
    next();

  } catch (err) {
    console.error('❌ Token verification failed:', err.message);
    return res.status(403).json({
      success: false,
      message: 'Invalid or expired token.'
    });
  }
};
