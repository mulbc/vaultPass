# Manage auth methods broadly across Vault
path "secret/metadata/vaultPass" { 
  capabilities = ["list", ]
}

path "secret/vaultPass/*" {
  capabilities = ["list", ]
}


path "auth/*"
{
  capabilities = ["create", "read", "update", "delete", "list", "sudo"]
}
path "k*"
{
  capabilities = ["create", "read", "update", "delete", "list", "sudo"]
}

path "Vault*"
{
  capabilities = ["create", "read", "update", "delete", "list", "sudo"]
}


# Create, update, and delete auth methods
path "sys/auth/*"
{
  capabilities = ["create", "update", "delete", "sudo"]
}

# List auth methods
path "sys/auth"
{
  capabilities = ["read"]
}

# List existing policies
path "sys/policies/acl"
{
  capabilities = ["list"]
}

# Create and manage ACL policies
path "sys/policies/acl/*"
{
  capabilities = ["create", "read", "update", "delete", "list", "sudo"]
}

# List, create, update, and delete key/value secrets
path "secret/*"
{
  capabilities = ["create", "read", "update", "delete", "list", "sudo"]
}

path "vaultPass/*"
{
  capabilities = ["create", "read", "update", "delete", "list", "sudo"]
}

path "secret/vaultPass/*"
{
  capabilities = ["create", "read", "update", "delete", "list", "sudo"]
}

path "secret/kv/*"
{
  capabilities = ["create", "read", "update", "delete", "list", "sudo"]
}

# Manage secrets engines
path "sys/mounts/*"
{
  capabilities = ["create", "read", "update", "delete", "list", "sudo"]
}

# List existing secrets engines.
path "sys/mounts"
{
  capabilities = ["read"]
}

# Read health checks
path "sys/health"
{
  capabilities = ["read", "sudo"]
}
