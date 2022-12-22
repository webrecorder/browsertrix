## Microk8s

This provides an easy way to install BrowserTrix Cloud on an ubuntu (tested on Jammy Jellyfish) and a RedHat 9 (tested on Rocky Linux 9). It automatically sets up BrowserTrix with, letsencrypt certificates.

### Requirements

To run this ansible playbook, you need to:

* Have a server / VPS where browsertrix will run.
* Configure a DNS A Record to point at your server's IP address.
* Make sure you can ssh to it, with a sudo user: ssh <your-user>@<your-domain>
* Install Ansible on your local machine (the control machine).

#### Install

Clone the repo:

```zsh
git clone https://github.com/webrecorder/browsertrix-cloud.git
cd browsertrix-cloud
```

[Look at the configuration options](https://github.com/webrecorder/browsertrix-cloud/blob/main/ansible/group_vars/microk8s/main.yml)

and modify them or pass them as extra variables as shown below. 

Add your IP address above to a new file called [inventory/hosts]

Run the playbook:

```zsh
ansible-playbook -i inventory/hosts playbooks/install_microk8s.yml -e host_ip="1.2.3.4" -e domain_name="yourdomain.com"
```

#### Upgrading

* Run `git pull`
* Run the playbook:
```zsh
ansible-playbook -i inventory/hosts playbooks/install_microk8s.yml -e host_ip="1.2.3.4" -e domain_name="yourdomain.com" -t helm_upgrade
```
