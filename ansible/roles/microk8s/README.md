Role Name
=========

Installs and configures [MicroK8s](https://microk8s.io/)

Requirements
------------

Any pre-requisites that may not be covered by Ansible itself or the role should be mentioned here. For instance, if the role uses the EC2 module, it may be a good idea to mention in this section that the boto package is required.

Role Variables
--------------

Add plugins you need installed with the following. (in the example below we are
adding `istio`)

```yaml
microk8s_plugins:
  istio: true                            # Core Istio service mesh services
```

more information at [defaults/main.yml](defaults/main.yml)

Dependencies
------------

A list of other roles hosted on Galaxy should go here, plus any details in regards to parameters that may need to be set for other roles, or variables that are used from other roles.

Example Playbook
----------------

Including an example of how to use your role (for instance, with variables passed in as parameters) is always nice for users too:

    - hosts: servers
      roles:
         - { role: username.rolename, x: 42 }

License
-------

ISC
