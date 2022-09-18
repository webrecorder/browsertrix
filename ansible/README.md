### Playbooks to install browsertrix

#### DigitalOcean

To install browsertrix on [DigitalOcean](playbooks/do_setup.yml) you will need to the following:

  * Install ansible 
  * Set up a DigitalOcean API token and save it in your environment as `DO_API_TOKEN`
  * Set up a Spaces ACCESS and SECRET KEY and save them in your environment as `DO_AWS_ACCESS_KEY` and `DO_AWS_SECRET_KEY`

Pay particular attention to the variables and modify them to suit you needs. In addition to the variables you will need a registered domain name or modify your `/etc/hosts` file to point to the domain you create. It defaults to `example.edu`
