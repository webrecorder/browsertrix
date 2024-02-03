

# Deploying Single Sign On
- [Deploying Single Sign On](#deploying-single-sign-on)
  - [General Configuration](#general-configuration)
  - [Deploying SSO with OIDC](#deploying-sso-with-oidc)
    - [Requirements](#requirements)
    - [Configuration of IDP](#configuration-of-idp)
    - [Configuration of Browsertrix](#configuration-of-browsertrix)
  - [Deploying SSO with Headers](#deploying-sso-with-headers)
    - [Requirements](#requirements-1)
    - [Configuration of Proxy](#configuration-of-proxy)
    - [Configuration of Browsertrix](#configuration-of-browsertrix-1)


Browsertrix allows for Single Sign On using either OIDC protocol or based on header values.

Although it is technically possible to enable both OIDC and Header based SSO at the same time it is not suggested, to keep the user experience seamless.

Single Logout is not supported as of now.

## General Configuration
When using SSO for login to Browsertrix the users' organizations are assigned and removed dynamically based on users' group memberships provided by the IDP/Proxy.

This can result in two conflicts with the invite functionality:
- Users org membership will be reset as soon as an user logs in with SSO, therefore any manual assignement will be lost.
- Users supposed to login with SSO are able to create accounts with password login if invited manually.

If this is a problem for the insitution deploying Browsertrix it is possible to disable either functionality by setting the following variables in the local values.yml file:

```yaml
password_disabled: 1
invites_disabled: 1
```

If disabling password altogether it is recommended to assign some users superuser privileges by adding them to "browsertrix-admins" group on the authentication backend.

The superuser group can be changed by setting the __sso_superuser_groups__ variable in values.yml

eg.
```yaml
sso_superuser_groups: browsertrix-admins;Domain Admins  # Semicolon separated list of groups whose users should be promoted to superadmins
```

## Deploying SSO with OIDC
### Requirements
- IDP supporting OIDC. This guide will take Keycloak as an example.

### Configuration of IDP
1. Create a new client scope
   1. Set a pertinent name, eg. browsertrix-authorization
   2. Type: None
   3. Protocol OpenID Connect
   4. In the Mappers
      1. Create new mapper, by configuration
      2. Type: Group Membership
      3. Name: isMemberOf
      4. Token Claim Name: isMemberOf
         1. This should the value set in values.yml (default if not set: isMemberOf)
      5. FullGroupPath: Off
      6. Add to ID token: On
      7. Add to access token: Off
      8. Add to userinfo: On
2. Create a new client in Keycloak
3. In client settings:
   1. Choose a client ID
   2. Set Root URL, Home URL, Admin URL to your main Browsertrix URL (eg. https://archive.example.com)
   3. Set Valid redirect URIs to https://archive.example.com/*
   4. Set Web origins to "+"
   5. Ensure Client Authentication and Standard Flow are enabled.
4. In client credentials
   1. Ensure authenticator is set to client id and secret
   2. Copy client secred to reuse in values.yml
5. In client scopes
   1. Add client scope, select previously created scope
   2. Set assigned type to Default
   
When Browsertrix processes the OIDC login it is expected that the userinfo token has the following fields set, if your IDP uses different names ensure that it is reflected in the values.yml config.
- preferred_username
  - string
  - will be used as the user display name
- email
  - string
  - will be used as email and for matching user
- isMemberOf
  - list of groups
  - each group should be a single string
  - will be used to dynamically add/remove organization membership for the user on login

This can be verified with the Evaluate tool in Keycloak client scopes.
Evaluate with a test user and verify that in user info the following is correct:
  1. preferred_username is present and set to correct value
  2. email is present and set to correct value
  3. isMemberOf is present and set to a LIST of groups the user belongs to.

### Configuration of Browsertrix
When configuring Broswertrix with OIDC as SSO protocol the following variables have to be set and match the previously configured settings in the IDP client.

sso_oidc_auth_endpoint, sso_oidc_token_endpoint, sso_oidc_userinfo_endpoint can be found in the .well-known configuration for OIDC (eg. https://idp.example.com/auth/realms/example/.well-known/openid-configuration)

```yaml
# Open ID Connect SSO

sso_oidc_enabled: 1
sso_oidc_auth_endpoint: https://idp.example.com/auth/realms/example/protocol/openid-connect/auth
sso_oidc_token_endpoint: https://idp.example.com/auth/realms/example/protocol/openid-connect/token
sso_oidc_userinfo_endpoint: https://idp.example.com/auth/realms/example/protocol/openid-connect/userinfo
sso_oidc_client_id: yourclientid
sso_oidc_client_secret: yourclientsecret
sso_oidc_redirect_url: https://browsertrix.example.com/log-in/oidc
# sso_oidc_allow_http_insecure: 0  (optional and not suggested, only for testing purposes)
# Optional, defaults to the below values
# sso_oidc_userinfo_email_field: email
# sso_oidc_userinfo_username_field: preferred_username
# sso_oidc_userinfo_groups_field: isMemberOf
```

## Deploying SSO with Headers
### Requirements
- Authenticating proxy. This guide will take Apache2 as an example configured with Shibboleth.

### Configuration of Proxy
1. Configure proxy to authenticate users with your preferred Identity Provider. Ensure that username, email and group membership are provided to the proxy. Configuration of this step is outside of this guide scope.
2. Create virtual host for browsertrix
3. Protect the following paths behind authentication
    - /log-in/header 
    - /api/auth/jwt/login/header
4. Transform and send the following user attributes as headers:
    - email -> x-remote-email 
    - username -> x-remote-user
    - group memberships (as a single, semicolon separated string) -> x-remote-groups
    - If they are sent with different header names or you use a different separator for the group string ensure you edit values.yml accordingly.
```apache
<IfModule mod_ssl.c>
	<VirtualHost *:443>
		ServerAdmin webmaster@example.com
		ServerAlias archive.example.com
		
		<Location /log-in/header>
			AuthType shibboleth
			ShibRequestSetting requireSession true
			Require valid-user
			RequestHeader set X-Remote-User %{uid}e
			RequestHeader set X-Remote-Email %{principalName}e
			RequestHeader set X-Remote-Groups %{isMemberOf}e
		</Location>

        <Location /api/auth/jwt/login/header>
			AuthType shibboleth
			ShibRequestSetting requireSession true
			Require valid-user
			RequestHeader set X-Remote-User %{uid}e
			RequestHeader set X-Remote-Email %{principalName}e
			RequestHeader set X-Remote-Groups %{isMemberOf}e
		</Location>

		SSLProxyEngine on
		
		ProxyPreserveHost On

        ProxyPass / https://k8s-ingress.example.com:443/
		ProxyPassReverse / https://k8s-ingress.example.com:443/

		Protocols h2 http/1.1
		
		ErrorLog ${APACHE_LOG_DIR}/error.log
		CustomLog ${APACHE_LOG_DIR}/access.log combined

		SSLEngine on

		SSLCertificateFile	/etc/letsencrypt/live/archive.example.com/fullchain.pem
		SSLCertificateKeyFile /etc/letsencrypt/live/archive.example.com/privkey.pem
	</VirtualHost>
</IfModule>

```


### Configuration of Browsertrix
When configuring Broswertrix with Header Auth as SSO protocol the following variables have to be set and match the previously configured settings in the IDP client.

```yaml
# Header SSO

# Enabled: 1, Disabled 0 (Default)
sso_header_enabled: 1
# Optional, defaults to below values
# sso_header_email_field: x-remote-email
# sso_header_username_field: x-remote-user
# sso_header_groups_field: x-remote-groups
# sso_header_groups_separator: ';'
```