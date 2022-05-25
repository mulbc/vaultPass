# vaultPass

A Browser extension to leverage Hashicorp Vault as Credential Storage for teams

A project started on a Hackathon @ ironSource by [Dimitry1987](https://github.com/Dmitry1987) and continued by [Chris Blum](https://github.com/zeichenanonym)

**Get it:**\
&nbsp;&nbsp; [Chrome Store](https://chrome.google.com/webstore/detail/vaultpass/kbndeonibamcpiibocdhlagccdlmefco)\
&nbsp;&nbsp; [Firefox AMO](https://addons.mozilla.org/en-GB/firefox/addon/vaultpass/)

## Current features

1. Connect to Vault and get Token
2. Get list of potential credentials in Popup
3. Select credentials from popup and have them filled into the website
4. Copy username & password to the clipboard

## Requirements

Vault needs to be prepared to use this extention.
This extention expects secrets to be saved in the 'secret' mount path (the default KV store).
Version 1 and 2 of the KV store are supported - only difference are the Vault policies you will have to write.
The path in this mount should be `/vaultPass/[someOrg]/url` where:

- `someOrg` will be some organisational level in your company to separate access levels
  - You can activate and deactivate these "folders" in options
- `url` is a URL or part of it that the credentials should match for
  - Be aware that \* characters (and potentially others...) may not work!
  - It should have _at least_ the keys `username` and `password` with the respective information
- Get a Token via the options page of this extention

## Example policies

There are two short docs to get your started with access policies:

- [KV version 1](docs/access_policies_v1.md)
- [KV version 2](docs/access_policies_v2.md)

If you just installed Vault - you propably have Version 2.

## TODO

- Create application specific Token instead of using the user-token
- Write (new) credentials to Vault
  - Out of scope --> Do this directly in Vault for now

## Notes

Tested with Vault 1.0.x

## Contribute

### Pre-Commit Hook

If you contribute, please install the [pre-commit Hook](https://pre-commit.com/).
If you have no idea what I am talking about - it's as easy as this:

```bash
pip install pre-commit
pre-commit install
```

This will install the hook and will run [checks](.pre-commit-config.yaml) before you commit changes.

### Setup development Vault instance

Afterwards you can set up a development Vault instance using the `./start_dev_environment.sh` script. The script will use docker (also works with podman) to start a local Vault in dev mode and configure a user `mitchellh` with password `foo` for the userpass module. There is a default VaultPass secret for `google.com`.

You can also reach the Vault Web UI via http://localhost:8200/ui and login with the `myroot` token.

NEW: This will now also spin up an openLDAP test server based on https://github.com/rroemhild/docker-test-openldap and configure Vault to use it.

When you run the script, the output should look like this:

```bash
$ ./start_dev_environment.sh
9c2b08a15a299bfea63287c6bb5a8a9c6a41a761ff8f79372423a0488e69e2fb
e59529399f56c8fc0c17c8e1bb52ebf00a6092533cf0f3d3c63de8bcf43a2273
Success! You are now authenticated. The token information displayed below
is already stored in the token helper. You do NOT need to run "vault login"
again. Future Vault requests will automatically use this token.

Key                  Value
---                  -----
token                myroot
token_accessor       z3Xe85dqSit2jEuA6VbsoF08
token_duration       ∞
token_renewable      false
token_policies       ["root"]
identity_policies    []
policies             ["root"]
Key              Value
---              -----
created_time     2022-05-25T15:00:13.317169405Z
deletion_time    n/a
destroyed        false
version          1
Key              Value
---              -----
created_time     2022-05-25T15:00:13.349194927Z
deletion_time    n/a
destroyed        false
version          1
Success! Enabled userpass auth method at: userpass/
Success! Data written to: auth/userpass/users/mitchellh
Success! Data written to: sys/policy/default
Success! Enabled ldap auth method at: ldap/
Success! Data written to: auth/ldap/config
Success! Data written to: auth/ldap/groups/admin_staff
```

Afterwards you can login to this Vault instance with the VaultPass extension like this:
![VaultPass dev login](docs/VaultPassDevLogin.png "VaultPass dev login")

Use `foo` as the password for the `mitchellh` user.

This user has access to the secrets in the `Admin` folder and no access to the secrets in the `Denied` folder. This is defined in the [dev_default.hcl](dev_default.hcl) file and applied by the [start_dev_environment.sh](start_dev_environment.sh) script.

You can now also login as any "Futurama" user from https://github.com/rroemhild/docker-test-openldap.
Users from the "admin_staff" group are configured to get the "admin" profile.
You can test it like this:

```bash
$ docker exec -it --env 'VAULT_ADDR=http://127.0.0.1:8200' dev-vault sh -c 'vault login -method=ldap username=hermes'
Password (will be hidden):
Success! You are now authenticated. The token information displayed below
is already stored in the token helper. You do NOT need to run "vault login"
again. Future Vault requests will automatically use this token.

Key                    Value
---                    -----
token                  s.TNZp1LHcq9M20SALGIahcEx4
token_accessor         MLdc6OSfP9sKgiTQ5pZx8LJ0
token_duration         768h
token_renewable        true
token_policies         ["admin" "default"]
identity_policies      []
policies               ["admin" "default"]
token_meta_username    hermes
```

As you can see, we logged in as "hermes" who is member of the "admin_staff" group and we get the default and admin policy applied. If we try the same as fry, we only get the default policy applied:

```bash
$ docker exec -it --env 'VAULT_ADDR=http://127.0.0.1:8200' dev-vault sh -c 'vault login -method=ldap username=fry'  
Password (will be hidden):
Success! You are now authenticated. The token information displayed below
is already stored in the token helper. You do NOT need to run "vault login"
again. Future Vault requests will automatically use this token.

Key                    Value
---                    -----
token                  s.XaSJRNGW6Iy4aSpLFN50szQT
token_accessor         3hSyjqyEr00XHT0tdwQiPHKZ
token_duration         768h
token_renewable        true
token_policies         ["admin" "default"]
identity_policies      []
policies               ["admin" "default"]
token_meta_username    fry
```

NOTE: Username and Password are the same for all users supplied via ldap ;)

To stop and delete this Vault instance run this command:

```bash
docker pod rm -f vaultpass-dev
```

Afterwards it can be recreated with the [start_dev_environment.sh](start_dev_environment.sh) script.
