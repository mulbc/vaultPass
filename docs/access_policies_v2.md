# Example access policies using Vault KV version 2

The second version of the Vault KV store separates policies into data and metadata access.
Therefore the policies look a little bit different

VaultPass already expects you to separate credentials by the different organisations/teams/groups that want to access them.
The full path that VaultPass expects inside of your Vault installation looks like this: `/secret/VaultPass/[ORG]/[REGEX]` where org represents the mentioned groups and the regex should match "something" in your URL.

In the following I will show you how to restrict access to your VaultPass credentials to groups in Vault. Since we currently only support login via LDAP and userpass - I recommend using the LDAP group mapping mechanism explained in the [Vault Documentation](https://www.vaultproject.io/docs/auth/ldap.html#group-membership-resolution)

Additionally I assume that you are familiar with the model of [Policies in Vault](https://www.vaultproject.io/docs/concepts/policies.html).

## Disclaimer

This document is only meant to be a quick getting started for people generally knowledgable in Vault.
The files provided here are solely meant as examples and very likely do not express best practice or a secure installation.

## Default Policy

default.hcl:
```hcl
[...]

# Allow listing orgs in VaultPass
path "secret/metadata/vaultPass" {
  capabilities = [
    "list",
  ]
}

# Deny any access to vaultPass credentials by default
path "secret/data/vaultPass/*" {
  capabilities = [
    "deny",
  ]
}
```
`vault write /sys/policy/default policy=@default.hcl`

## Organsational policy

Assuming that `org1` is a group in your Vault installation - this would be the policy you need to allow them access to their credentials.
Repeat this for every group that needs access to VaultPass.

org1.hcl:
```hcl
# Allow org1 full access to their credentials
path "secret/data/vaultPass/org1/*" {
  capabilities = [
    "create",
    "read",
    "update",
    "delete",
  ]
}

path "secret/metadata/vaultPass/org1/" {
  capabilities = [
    "list",
  ]
}
```

`vault write /sys/policy/org1 policy=@org1.hcl`

## Example credentials

Here is an example of how to fill your new group with a test credential:

testcreds.json:
```json
{
  "title": "Just testing",
  "username": "testUser",
  "password": "abc123",
  "comment": "This is a test entry",
}

```

`vault kv put secret/vaultPass/org1/e @testcreds.json`

This will result in a "file" at the path vaultPass/org1/e which will match all URLs that contain at least one 'e'.
