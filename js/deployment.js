// Distinguish a local preview from a public deployment whose provenance is absent.
// A missing build.json is not evidence that a published site is a local preview.
const FULL_COMMIT = /^[0-9a-f]{40}$/i;

export function deploymentLabel(build, hostname = '') {
  if (build && typeof build.commit === 'string' && FULL_COMMIT.test(build.commit)) {
    return `deployed from tower@${build.commit.slice(0, 7)}`;
  }
  if (['localhost', '127.0.0.1', '[::1]', ''].includes(hostname)) {
    return 'local preview (no deploy commit)';
  }
  return 'deployment commit unverified (build.json missing or invalid)';
}
