### Playbooks to install browsertrix

#### DigitalOcean

To install browsertrix on [DigitalOcean](playbooks/do_setup.yml) you will need to the following:

* Install [ansible](https://www.ansible.com)
* Set up a DigitalOcean API token and save it in your environment as `DO_API_TOKEN`
* Set up a Spaces ACCESS and SECRET KEY and save them in your environment as `DO_AWS_ACCESS_KEY` and `DO_AWS_SECRET_KEY`
* make a copy of [group_vars/do/private.yml.example](group_vars/do/private.yml.example) to [group_vars/do/private.yml](group_vars/do/private.yml)


##### Digital Ocean Variables

See Known Issues below.

The first running of the playbook will place variables under your tmp directory in the following format YYYY-MM-DD@:HH:MMd_ocean*. Content of these files will need to be added to the  [group_vars/do/private.yml](group_vars/do/private.yml) or else run as an `-e` extra value as shown below

```yaml
-e btrix_db_url: (contents of /tmp/YYYY-MM-DD@:HH:MMd_ocean_btrix_db_url.txt`
-e lb_uuid: (contents of /tmp/YYYY-MM-DD@:HH:MMd_ocean_lb_uuid.txt`
-e loadbalancer_ip: (contents of /tmp/YYYY-MM-DD@:HH:MMd_ocean_loadbalancer_ip.txt`
-e domain_name: <your registered domain
```

In addition change the name (it will default to demo otherwise) and the region DigitalOcean preferred region (it will default to sfo3).

##### Example Playbooks

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

Known Issues:

The `doctl` tool is the only one that allows us to create a mongodb password. We continue to investigate why this cannot use ansible's [set_fact](https://docs.ansible.com/ansible/latest/collections/ansible/builtin/set_fact_module.html) in the playbook. 
The Kubernetes task creates a loadbalancer which will not be ready by the time the playbook completes the first time. So a second or sometimes 3rd run will be needed. 
