#!/bin/sh

# This starts the dev Vault environment using Docker / Podman
# This will enable the userpass auth module with the mitchellh user with password foo

GIT_ROOT=$(git rev-parse --show-toplevel)

docker run \
    --cap-add=IPC_LOCK \
    --env 'VAULT_DEV_ROOT_TOKEN_ID=myroot' \
    --name=dev-vault \
    --detach \
    --publish 8200:8200/tcp \
    --rm \
    vault

VAULT_SETUP="
# Login to Vault
vault login myroot

# Create example secret for google.com domains
vault kv put secret/vaultPass/admin/google.com username=testUser password=unsafe
vault kv put secret/vaultPass/denied/google.com username=testUser password=unsafe

# Enable userpass auth and create example set
vault auth enable userpass
vault write \
    auth/userpass/users/mitchellh \
    password=foo \
    policies=admins
vault write /sys/policy/default policy=@/dev_default.hcl
"

docker cp "$GIT_ROOT/dev_default.hcl" dev-vault:/

docker exec -it --env 'VAULT_ADDR=http://127.0.0.1:8200' dev-vault sh -c "$VAULT_SETUP"
