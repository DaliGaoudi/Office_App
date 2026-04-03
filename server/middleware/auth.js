const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'huissier_mourad_secret_legacy';

/**
 * Authentication Middleware
 * Verifies JWT token and attaches user info to req.user
 */
function authenticate(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
        console.warn("No token provided for request:", req.originalUrl);
        return res.status(401).json({ error: 'Access denied. No token provided.' });
    }

    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        req.user = decoded;
        
        // Ensure id_so is a string (consistent with legacy behavior)
        if (req.user.id_so) {
            req.user.id_so = String(req.user.id_so);
        }
        
        next();
    } catch (err) {
        console.error("Token verification failed:", err.message);
        res.status(403).json({ error: 'Invalid or expired token.' });
    }
}

module.exports = authenticate;
