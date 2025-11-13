require('dotenv').config();

const jwt = require('jsonwebtoken')
const JWT_SECRET = process.env.JWT_SECRET || 'secret-key'

const verifyToken = (req, res, next) => {
  const authHeader = req.headers.authorization || req.headers.token

  if (!authHeader) {
    return res.status(401).json({ success: false, message: 'No token provided' })
  }

  const token = authHeader.replace('Bearer ', '')

  jwt.verify(token, JWT_SECRET, (err, decoded) => {
    if (err) {
      return res.status(403).json({ success: false, message: 'Invalid or expired token' })
    }

    req.user = decoded 
    console.log(req.user);// Attach decoded user info to request
    next()
  })
}

module.exports = verifyToken
