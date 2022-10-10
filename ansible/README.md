### Playbook to install browsertrix

#### DigitalOcean

To install browsertrix on [DigitalOcean](playbooks/do_setup.yml) you will need to the following:

* Install [ansible](https://www.ansible.com) 
* Set up a DigitalOcean API token and save it in your environment as `DO_API_TOKEN`
* Set up a Spaces ACCESS and SECRET KEY and save them in your environment as `DO_AWS_ACCESS_KEY` and `DO_AWS_SECRET_KEY`

Pay particular attention to the variables left under your tmp directory. You will need the time stamped generated txt files that will have to match the variables when your run this playbook a second time.

* `-e btrix_db_url=(contents of /tmp/$date-d_ocean_btrix_db_url.txt`
* `-e lb_uuid=(contents of /tmp/$date-d_ocean_lb_uuid.txt`
* `-e loadbalancer_ip=(contents of /tmp/$date-d_ocean_loadbalancer_ip.txt`
* `-e domain_name=<your registered domain>

The playbook will install the Kubernetes [package manager](https://helm.sh/) and the [DigitalOcean Controller](https://docs.digitalocean.com/reference/doctl/) both are useful in managing your installation. 

* Run the playbook two times.

```zsh
ansible-playbook -v playbooks/do_setup.yml
ansible-playbook -v playbooks/do_setup.yml -t helm_upgrade -e btrix_db_url= -e lb_uuid= -e loadbalancer_ip=
```

Every subsequent time one needs to run helm updates the `-t helm_upgrade` can be passed to the playbook like so:

```zsh
ansible-playbook -v playbooks/do_setup.yml -t helm_upgrade
```
