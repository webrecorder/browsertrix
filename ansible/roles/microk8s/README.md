Role Name
=========

Installs and configures [MicroK8s](https://microk8s.io/)

Requirements
------------


Role Variables
--------------

Add plugins you need installed with the following. (in the example below we are
adding `istio`)

```yaml
microk8s_plugins:
  istio: true                            # Core Istio service mesh services
```

more information at [defaults/main.yml](defaults/main.yml)

You will want to make sure you add a value for `users` above. This will be the
user that runs microk8s

Dependencies
------------

The example here has been tested with Docker's Runtime

Example Playbook
----------------

Including an example of how to use your role (for instance, with variables passed in as parameters) is always nice for users too:

    - hosts: servers
      roles:
         - { role: username.rolename, x: 42 }

License
-------

ISC
