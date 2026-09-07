const rateLimit = require("express-rate-limit");

// Tight limit on login/register to blunt brute-force and credential-stuffing attempts
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many attempts. Please try again in a few minutes." },
});

// Looser but still bounded limit for password-reset requests (avoid email bombing)
const resetLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many reset requests. Please try again later." },
});

module.exports = { authLimiter, resetLimiter };
