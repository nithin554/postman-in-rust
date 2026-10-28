/**
 * Resolves the version semantic-release would publish next, without publishing anything.
 *
 * The dry run loads the same `.releaserc.json`, plugins and git history as the release job, so the
 * build can stamp the executable with the exact version the tag will carry. The value is written to
 * `$GITHUB_OUTPUT` for the workflow; when that variable is absent (local runs) it is only logged.
 */
import { appendFileSync } from 'node:fs';
import semanticRelease from 'semantic-release';

const result = await semanticRelease({ dryRun: true });

if (!result) {
  console.log('No release is pending; leaving the app version untouched.');
} else {
  const { version } = result.nextRelease;
  console.log(`Next release version: ${version}`);
  if (process.env.GITHUB_OUTPUT) {
    appendFileSync(process.env.GITHUB_OUTPUT, `version=${version}\n`);
  }
}
