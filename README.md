- requirements: `yarn`, `jq`
- run `yarn setup`
  - KV names can only be alphanumeric with underscores
  - KV will be named service_name-KV_NAME
- populate the "preview" KV store
- run `yarn dev` to test
- run `yarn deploy` to deploy
- populate the "production" KV store

- update `wrangler.toml` if things change
- values can be JSON or text

go-vanity-cf-worker.innotegrity.workers.dev/toolbox
{ "source": "github.com/josh-hogle/go-toolbox", "defaultBranch": "master", "vcs": "git" }

go.innotegrity.dev/toolbox
github.com/josh-hogle/go-toolbox

