{{/*
IPv4 and IPv6 egress blocks for the application namespace policy. Excludes
loopback, link-local and cloud metadata addresses.
*/}}
{{- define "browsertrix.egressIpBlocks" -}}
- ipBlock:
    cidr: 0.0.0.0/0
    except:
      - 169.254.0.0/16
      - 127.0.0.0/8
- ipBlock:
    cidr: ::/0
    except:
      - fe80::/10
      - ::1/128
      - fd00:ec2::254/128
      - fd20:ce::254/128
{{- end -}}
