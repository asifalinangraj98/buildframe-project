const passport = require("passport");
const GoogleStrategy = require("passport-google-oauth20").Strategy;
const GitHubStrategy = require("passport-github2").Strategy;
const User = require("../models/User");

async function findOrCreateSocialUser({ provider, providerId, email, name }) {
  let user = await User.findOne({ provider, providerId });
  if (user) return user;

  // Link by email if the person already has a local account
  user = await User.findOne({ email });
  if (user) {
    user.provider = provider;
    user.providerId = providerId;
    await user.save();
    return user;
  }

  user = new User({ email, name, provider, providerId });
  await user.save();
  return user;
}

passport.use(
  new GoogleStrategy(
    {
      clientID: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      callbackURL: process.env.GOOGLE_CALLBACK_URL,
    },
    async (accessToken, refreshToken, profile, done) => {
      try {
        const user = await findOrCreateSocialUser({
          provider: "google",
          providerId: profile.id,
          email: profile.emails?.[0]?.value,
          name: profile.displayName,
        });
        done(null, user);
      } catch (err) {
        done(err);
      }
    }
  )
);

passport.use(
  new GitHubStrategy(
    {
      clientID: process.env.GITHUB_CLIENT_ID,
      clientSecret: process.env.GITHUB_CLIENT_SECRET,
      callbackURL: process.env.GITHUB_CALLBACK_URL,
    },
    async (accessToken, refreshToken, profile, done) => {
      try {
        const user = await findOrCreateSocialUser({
          provider: "github",
          providerId: profile.id,
          email: profile.emails?.[0]?.value || `${profile.username}@users.noreply.github.com`,
          name: profile.displayName || profile.username,
        });
        done(null, user);
      } catch (err) {
        done(err);
      }
    }
  )
);

module.exports = passport;
