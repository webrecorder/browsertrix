### Playbooks to install browsertrix

#### DigitalOcean

To install browsertrix on [DigitalOcean](playbooks/do_setup.yml) you will need to the following:

* Install [ansible](https://www.ansible.com) 
* Set up a DigitalOcean API token and save it in your environment as `DO_API_TOKEN`
* Set up a Spaces ACCESS and SECRET KEY and save them in your environment as `DO_AWS_ACCESS_KEY` and `DO_AWS_SECRET_KEY`

Pay particular attention to the variables and modify them to suit your needs. In addition to the variables you will need a registered domain name or modify your `/etc/hosts` file to point to the domain you create(in instances where you do not have a real domain registered). It defaults to `example.edu`

The playbook will install the Kubernetes [package manager](https://helm.sh/) and the [DigitalOcean Controller](https://docs.digitalocean.com/reference/doctl/) both are useful in managing your installation. 

* Run the playbook once to set up your instance. Upon completion re-run the playbook after adding the `db_url:` value on [playbooks/do_setup.yml](playbooks/do_setup.yml) found at `/tmp/d_ocean_mongodb.txt` this will populate your mongo database credentials for your next run
* Run the playbook a second time with the `-t helm_upgrade` tag which only focuses on the helm updates tasks

```zsh
ansible-playbook -v playbooks/do_setup.yml
ansible-playbook -v playbooks/do_setup.yml -t helm_upgrade -e btrix_db_url=mongodb+srv://doadmin:secret@btrix-demo-r4nd0m.mongo.ondigitalocean.com/admin?tls=true&authSource=admin -e loadbalancer_ip=1.2.3.4
```

## TODO

The ability to extract the loadbalancer IP is a work in progress. 
