#!/bin/bash
USER='test'
PASSWD='test'
ORG='sa2rn'
SITE='localhost'

token=$(cat /vault/token)

export $token

echo "Creating policies"
vault policy write admin /vault/policies/admin.hcl
echo "Enable userpass"
vault auth enable userpass
echo "Creating username/pass"
vault write auth/userpass/users/$USER password=$PASSWD policies=admin
echo "Creating secrets"
vault secrets enable -path=secret/ kv-v2
echo "Put example values"
vault kv put secret/vaultPass/$ORG/$SITE username=$USER password=$PASSWD
