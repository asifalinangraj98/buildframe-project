const express = require("express");
const crypto = require("crypto");
const passport = require("passport");
const User = require("../models/User");
const { signAccessToken, signRefreshToken, requireAuth } = require("../middleware/auth");
const { authLimiter, resetLimiter } = require("../middleware/rateLimit");
const { sendPasswordResetEmail } = require("../utils/email");

const router = express.Router();

const REFRESH_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax",
  maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
};

function publicUser(user) {
  return { id: user._id, name: user.name, email: user.email, provider: user.provider };
}

// ---------- Register ----------
router.post("/register", authLimiter, async (req, res) => {
  try {
    const { name, email, password } = req.body;

    if (!email || !password || password.length < 8) {
      return res.status(400).json({ error: "Email and a password of at least 8 characters are required" });
    }

    const existing = await User.findOne({ email: email.toLowerCase() });
    if (existing) {
      return res.status(409).json({ error: "Could not create account with these details" });
    }

    const user = new User({ name, email: email.toLowerCase(), provider: "local" });
    await user.setPassword(password);
    await user.save();

    const accessToken = signAccessToken(user);
    const refreshToken = signRefreshToken(user);
    res.cookie("refreshToken", refreshToken, REFRESH_COOKIE_OPTIONS);

    res.status(201).json({ user: publicUser(user), accessToken });
  } catch (err) {
    res.status(500).json({ error: "Registration failed" });
  }
});

// ---------- Login ----------
router.post("/login", authLimiter, async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email: (email || "").toLowerCase() }).select(
      "+passwordHash +failedLoginAttempts +lockUntil"
    );

    const invalidCreds = () => res.status(401).json({ error: "Invalid email or password" });

    if (!user) return invalidCreds();
    if (user.isLocked()) {
      return res.status(423).json({ error: "Account temporarily locked. Try again later." });
    }

    const validPassword = await user.verifyPassword(password);
    if (!validPassword) {
      user.failedLoginAttempts += 1;
      if (user.failedLoginAttempts >= 5) {
        user.lockUntil = Date.now() + 15 * 60 * 1000;
        user.failedLoginAttempts = 0;
      }
      await user.save();
      return invalidCreds();
    }

    user.failedLoginAttempts = 0;
    user.lockUntil = undefined;
    await user.save();

    const accessToken = signAccessToken(user);
    const refreshToken = signRefreshToken(user);
    res.cookie("refreshToken", refreshToken, REFRESH_COOKIE_OPTIONS);

    res.json({ user: publicUser(user), accessToken });
  } catch (err) {
    res.status(500).json({ error: "Login failed" });
  }
});

// ---------- Refresh access token ----------
router.post("/refresh", (req, res) => {
  const jwt = require("jsonwebtoken");
  const token = req.cookies?.refreshToken;
  if (!token) return res.status(401).json({ error: "Not authenticated" });

  try {
    const payload = jwt.verify(token, process.env.JWT_REFRESH_SECRET);
    const accessToken = jwt.sign({ sub: payload.sub }, process.env.JWT_ACCESS_SECRET, {
      expiresIn: process.env.JWT_ACCESS_EXPIRES || "15m",
    });
    res.json({ accessToken });
  } catch (err) {
    res.status(401).json({ error: "Session expired, please log in again" });
  }
});

// ---------- Logout ----------
router.post("/logout", (req, res) => {
  res.clearCookie("refreshToken", REFRESH_COOKIE_OPTIONS);
  res.json({ success: true });
});

// ---------- Current user ----------
router.get("/me", requireAuth, async (req, res) => {
  const user = await User.findById(req.userId);
  if (!user) return res.status(404).json({ error: "User not found" });
  res.json({ user: publicUser(user) });
});

// ---------- Forgot password ----------
router.post("/forgot-password", resetLimiter, async (req, res) => {
  const { email } = req.body;
  const user = await User.findOne({ email: (email || "").toLowerCase() });

  if (user && user.provider === "local") {
    const rawToken = user.createPasswordResetToken();
    await user.save();
    try {
      await sendPasswordResetEmail(user.email, rawToken);
    } catch (err) {
      console.error("Failed to send reset email:", err.message);
    }
  }

  res.json({ message: "If an account exists for that email, a reset link has been sent." });
});

// ---------- Reset password ----------
router.post("/reset-password", async (req, res) => {
  const { token, newPassword } = req.body;
  if (!token || !newPassword || newPassword.length < 8) {
    return res.status(400).json({ error: "A valid token and a password of at least 8 characters are required" });
  }

  const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
  const user = await User.findOne({
    resetTokenHash: tokenHash,
    resetTokenExpires: { $gt: Date.now() },
  }).select("+resetTokenHash +resetTokenExpires");

  if (!user) {
    return res.status(400).json({ error: "This reset link is invalid or has expired" });
  }

  await user.setPassword(newPassword);
  user.resetTokenHash = undefined;
  user.resetTokenExpires = undefined;
  user.failedLoginAttempts = 0;
  user.lockUntil = undefined;
  await user.save();

  res.json({ message: "Password updated. You can now log in." });
});

// ---------- Google OAuth ----------
router.get("/google", passport.authenticate("google", { scope: ["profile", "email"], session: false }));

router.get(
  "/google/callback",
  passport.authenticate("google", { session: false, failureRedirect: `${process.env.CLIENT_URL}/login?error=oauth` }),
  (req, res) => {
    const accessToken = signAccessToken(req.user);
    const refreshToken = signRefreshToken(req.user);
    res.cookie("refreshToken", refreshToken, REFRESH_COOKIE_OPTIONS);
    res.redirect(`${process.env.CLIENT_URL}/oauth-success?accessToken=${accessToken}`);
  }
);

// ---------- GitHub OAuth ----------
router.get("/github", passport.authenticate("github", { scope: ["user:email"], session: false }));

router.get(
  "/github/callback",
  passport.authenticate("github", { session: false, failureRedirect: `${process.env.CLIENT_URL}/login?error=oauth` }),
  (req, res) => {
    const accessToken = signAccessToken(req.user);
    const refreshToken = signRefreshToken(req.user);
    res.cookie("refreshToken", refreshToken, REFRESH_COOKIE_OPTIONS);
    res.redirect(`${process.env.CLIENT_URL}/oauth-success?accessToken=${accessToken}`);
  }
);

module.exports = router;
