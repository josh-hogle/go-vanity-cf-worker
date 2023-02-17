// listen for requests and handle them
addEventListener('fetch', event => {
  event.respondWith(handleRequest(event.request));
});

/**
 * Retrieves all of the Go package repo keys from the namespace.
 * @returns {array} A list of all package keys from the namespace.
 */
async function fetchKeys() {
  let resp = await REPO_KV.list();
  let keys = resp.keys;
  while (!resp.list_complete) {
    resp = await REPO_KV.list({ cursor: resp.cursor });
    keys.push(...resp.keys);
  }
  return keys;
}

/**
 * Retrieves the value of the given package key.
 * @param {string} key  Name of the package key to retrieve.
 * @returns {object} An objection containing the `source`, `vcs` and `defaultBranch` of the Go package repo.
 */
async function getValue(key) {
  let resp = undefined;
  try {
    resp = await REPO_KV.get(key, { type: 'json' });
  } catch {
    resp = await REPO_KV.get(key, { type: 'text' });
    resp = {
      source: resp,
    };
  }
  if (resp.vcs == undefined) {
    resp.vcs = 'git';
  }
  if (resp.defaultBranch == undefined) {
    resp.defaultBranch = 'main';
  }
  return resp;
}

/**
 * Formats the clause for the `go-import` meta tag.
 * @param {string} pkg  The name of the Go package repo.
 * @param {string} src  The actual source URL of the repository (without `https://` at the start).
 * @param {string} vcs  The type of VCS (typically `git`).
 * @returns {string} The formatted `go-import` meta tag clause.
 */
function getImportClause(pkg, src, vcs) {
  return `${pkg} ${vcs} https://${src}`;
}

/**
 * Formats the clause for the `go-source` meta tag.
 * @param {string} pkg            The name of the Go package repo.
 * @param {string} src            The actual source URL of the repository (without `https://` at the start).
 * @param {string} defaultBranch  The name of the default branch (typically `master` or `main`).
 * @returns {string} The formatted `go-source` meta tag clause.
 */
function getSourceClause(pkg, src, defaultBranch) {
  return (
    `${pkg} https://${src} https://${src}/tree/${defaultBranch}{/dir} ` +
    `https://${src}/blob/${defaultBranch}{/dir}/{file}#L{line}`
  );
}

/**
 * Formats the URL to the documentation on the `pkg.go.dev` website.
 * @param {string} pkg  The name of the Go package repo.
 * @returns {string} The formatted URL for the pacakge documentation.
 */
function getPackageURL(pkg) {
  return `https://pkg.go.dev/${pkg}`;
}

/**
 * Handles the incoming request by looking up the URL in the KV store and returning the appropriate HTML response.
 * @param {Request} request The incoming HTTP request.
 */
async function handleRequest(request) {
  const url = new URL(request.url);
  const vanity_keys = await fetchKeys();

  // search thru the keys to find the package being requested
  let searchFor = `${url.hostname}${url.pathname}`;
  console.debug(`searching for: ${searchFor}`);
  let pkg = undefined;
  for (let i = 0; i < vanity_keys.length; i++) {
    console.debug(`checking pkg: ${vanity_keys[i].name}`);
    if (
      searchFor == vanity_keys[i].name ||
      searchFor.startsWith(`${vanity_keys[i].name}/`)
    ) {
      pkg = vanity_keys[i].name;
      console.debug(`matched package!`);
      break;
    }
  }

  // package was not found
  if (pkg === undefined) {
    return new Response('404 NOT FOUND', {
      init: {
        headers: { 'Content-Type': 'text/plain' },
        status: 404,
        statusText: 'NotFound',
      },
    });
  }

  // grab the package information and craft the HTML response
  const value = await getValue(pkg);
  console.debug(`package info: ${JSON.stringify(value)}`);
  const importClause = getImportClause(pkg, value.source, value.vcs);
  const sourceClause = getSourceClause(pkg, value.source, value.defaultBranch);
  const pkgURL = getPackageURL(pkg);
  const html = `<!DOCTYPE html>
<html>
  <head>
    <meta http-equiv="Content-Type" content="text/html; charset=utf-8" />
    <meta name="go-import" content="${importClause}" />
    <meta name="go-source" content="${sourceClause}" />
    <meta http-equiv="refresh" content="0; url=${pkgURL}" />
  </head>
  <body>
    Nothing to see here! <a href="${pkgURL}">Move along</a>
  </body>
</html>`;

  // return the formatted HTML response with meta tags
  return new Response(html, {
    init: {
      headers: { 'Content-Type': 'text/html' },
      status: 200,
      statusText: 'OK',
    },
  });
}
