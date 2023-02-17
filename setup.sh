#!/bin/bash
#
# Initializes Cloudflare Worker resources
#

function find_namespace {
  local service=$1
  local namespace=$2

  # get a list of namespaces - note that NPM, Yarn, etc. may complain here so we need to
  # remove the first X number of lines up to the start of the JSON to parse with jq
  local output="$(wrangler kv:namespace list)"
  local json_lineno=$(echo "${output}" | grep -wn "\[" | cut -d':' -f1)
  local json="$(echo "${output}" | tail +${json_lineno})"
  
  # find the namespace ID
  NAMESPACE_ID="$(echo "${json}" | jq -r ".[] | select(.title == \"${service}-${namespace}\") | .id")"
  return 0
}

function create_kv_namespace {
  local service=$1
  local namespace=$2

  # see if namespace exists first
  echo -n "Creating KV namespace: ${namespace}..."
  find_namespace "${service}" "${namespace}"
  if [ ! -z "${NAMESPACE_ID}" ]; then
    echo "already exists - SKIPPING."
    return 0
  fi

  # create the namespace
  local output="$(wrangler kv:namespace create "${namespace}" 2>&1)"
  if echo "${output}" | grep -q ERROR; then
    echo "FAILED"
    echo
    echo "${output}"
    return 1
  fi
  echo "done."

  # get the namespace ID
  NAMESPACE_ID="$(echo "${output}" | grep "id =" | awk '{print $7}' | sed -e 's|^"||' -e 's|"$||')"
  return 0
}

echo "*** Cloudflare Worker Setup ***"
echo

# log into Cloudflare
echo "Logging into Cloudflare"
wrangler login
echo

# get input from user
# - name of service
# - name of KV store
# - custom domains
echo -n "Enter the name of the Cloudflare Worker service to create: [go-vanity-cf-worker] > "
read service_name
if [ -z "${service_name}" ]; then
  service_name="go-vanity-cf-worker"
fi
echo -n "Enter the name of the Cloudflare Worker KV store to create: [REPO_KV] > "
read kv_store_name
if [ -z "${kv_store_name}" ]; then
  kv_store_name="REPO_KV"
fi
custom_domains=()
while [ 1 ]; do
  echo -n "Enter the name of a custom domain to map to the worker or leave blank to end: [] > "
  read domain
  if [ -z "${domain}" ]; then
    break
  fi
  custom_domains+=("${domain}")
done
echo

# generate basic wrangler.toml file
script_dir=$( cd -- "$( dirname -- "${BASH_SOURCE[0]}" )" &> /dev/null && pwd )
toml_file="${script_dir}/wrangler.toml"
echo "name = \"${service_name}\"" >$toml_file

# create the KV namespaces
create_kv_namespace "${service_name}" "${kv_store_name}"
if [ $? -ne 0 ]; then
  exit 2
fi
kv_store_id="${NAMESPACE_ID}"
create_kv_namespace "${service_name}" "${kv_store_name}_PREVIEW"
if [ $? -ne 0 ]; then
  exit 2
fi
kv_store_preview_id="${NAMESPACE_ID}"

# generate the final wrangler.toml file
echo -n "Generating 'wrangler.toml' file..."
cat << EOF > "${toml_file}"
name = "${service_name}"
main = "./src/index.js"
compatibility_date = "2023-02-16"
workers_dev = true
kv_namespaces = [
  { binding = "REPO_KV", id = "${kv_store_id}", preview_id = "${kv_store_preview_id}" }
]
routes = [
EOF
for domain in "${custom_domains[@]}"; do
  echo "  { pattern = \"${domain}\", custom_domain = true }" >>"${toml_file}"
done
echo "]" >> "${toml_file}"
echo "done."
