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

replace this with the IP address of your endpoint

```yaml
---
- name: install microk8s
  hosts: "{{ your_ip }}"
  remote_user: "{{ your_user }}"
  become: true
  roles:
    - role: ../roles/microk8s
```
License
-------

ISC
