# DigitalOcean 

*Playbook Path: [ansible/playbooks/install_microk8s.yml](https://github.com/webrecorder/browsertrix-cloud/blob/main/ansible/playbooks/do_setup.yml)*

This playbook provides an easy way to install BrowserTrix Cloud on DigitalOcean. It automatically sets up Browsertrix with, LetsEncrypt certificates.

### Requirements

To run this ansible playbook, you need to:

* Have a [DigitalOcean Account](https://m.do.co/c/e0db3814e33e) where this will run.
* Create a [DigitalOcean API Key](https://cloud.digitalocean.com/account/api) which will need to be set in your terminal sessions environment variables
* Configure a DNS A Record and CNAME record.
* Install Ansible on your local machine (the control machine).

#### Install

1. Clone the repo:
```zsh
git clone https://github.com/webrecorder/browsertrix-cloud.git
cd browsertrix-cloud
```

2. [Look at the configuration options](https://github.com/webrecorder/browsertrix-cloud/blob/main/ansible/group_vars/do/main.yml) and modify them or pass them as extra variables as shown below. If you haven't configured `kubectl`, please enable the `configure_kube` option 

3. Run the playbook:
```zsh
ansible-playbook playbooks/do_setup.yml -e project_name="your-project" -e superuser_email="you@yourdomain.com" -e domain_name="yourdomain.com"
```

#### Upgrading

1. Run `git pull`

2. Run the playbook:
```zsh
ansible-playbook playbooks/do_setup.yml -e project_name="your-project" -e superuser_email="you@yourdomain.com" -e domain_name="yourdomain.com" -t helm_upgrade
```
