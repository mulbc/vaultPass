#!/bin/sh

# This starts the dev Vault environment using Docker / Podman
# This will enable the userpass auth module with the mitchellh user with password foo

GIT_ROOT=$(git rev-parse --show-toplevel)

docker pod rm -f vaultpass-dev || true

docker run \
    --cap-add=IPC_LOCK \
    --detach \
    --env 'VAULT_DEV_ROOT_TOKEN_ID=myroot' \
    --name=dev-vault \
    --publish 8200:8200/tcp \
    --publish 10389:10389 \
    --publish 10636:10636 \
    --pod new:vaultpass-dev \
    --rm \
    docker.io/hashicorp/vault:latest

docker run \
    --rm \
    --detach \
    --name=dev-ldap \
    --pod vaultpass-dev \
    ghcr.io/rroemhild/docker-test-openldap:master

VAULT_SETUP="
# Login to Vault
vault login myroot

# Create example secret for google.com domains
vault kv put secret/vaultPass/admin/google.com username=testUser password=unsafe username2=testUser2 password2=unsafe2
vault kv put secret/vaultPass/denied/google.com username=testUser password=unsafe

# Enable userpass auth and create example set
vault auth enable userpass
vault write \
    auth/userpass/users/mitchellh \
    password=foo \
    policies=admins
vault write /sys/policy/default policy=@/dev_default.hcl

# Enable LDAP auth
vault auth enable ldap
# Configure LDAP for test-openldap server
vault write auth/ldap/config \
    url='ldaps://localhost:10636' \
    userattr=uid \
    userdn='ou=people,dc=planetexpress,dc=com' \
    groupdn='ou=people,dc=planetexpress,dc=com' \
    groupfilter='(objectClass=group)' \
    groupattr='cn' \
    binddn='cn=admin,dc=planetexpress,dc=com' \
    bindpass='GoodNewsEveryone' \
    insecure_tls=true \
    starttls=true
vault write auth/ldap/groups/admin_staff policies=admin
"

docker cp "$GIT_ROOT/dev_default.hcl" dev-vault:/

docker exec -it --env 'VAULT_ADDR=http://127.0.0.1:8200' dev-vault sh -c "$VAULT_SETUP"

printf "\n\nDEV ENVIRONMENT STARTED!\n  Root token: myroot,\n  Vault web address: http://127.0.0.1:8200/ui\n\n  Username test user: mitchellh\n  Username test userpassword: foo\n\n  LDAP test user: bender\n  LDAP test userpassword: bender\n  LDAP test admin: professor\n  LDAP test adminpassword: professor"
