// Machine-specific app identity lives in the environment, not in this repo.
//
// `app.json` ships neutral placeholders so a stranger who forks hub-stack does
// not inherit the author's Expo account, bundle identifier, or project id. A
// build supplies the real values at config-eval time (locally, or on EAS via
// the profile's `env`) through these three variables:
//
//   EXPO_OWNER              Expo account/organisation that owns the project
//   IOS_BUNDLE_IDENTIFIER   permanent App Store bundle id (reverse-DNS)
//   EAS_PROJECT_ID          from `eas init` for your own Expo account
//
// Unset variables fall through to the placeholders in app.json. See
// docs/PUBLISH-APP.md → "Names and identifiers" for the fork checklist.
const base = require('./app.json').expo;

const owner = process.env.EXPO_OWNER;
const bundleIdentifier = process.env.IOS_BUNDLE_IDENTIFIER;
const projectId = process.env.EAS_PROJECT_ID;

module.exports = {
  expo: {
    ...base,
    ...(owner ? { owner } : {}),
    ios: {
      ...base.ios,
      ...(bundleIdentifier ? { bundleIdentifier } : {}),
    },
    extra: {
      ...base.extra,
      ...(projectId ? { eas: { ...(base.extra && base.extra.eas), projectId } } : {}),
    },
  },
};
