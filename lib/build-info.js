// The hosted build replaces this value with the source commit it actually built.
export const buildInfo = typeof __MTG_BUILD_INFO__ === "undefined"
  ? { commitSha: null, dirty: true, repository: "nobinko/mtg-token", builtAt: null }
  : __MTG_BUILD_INFO__;
