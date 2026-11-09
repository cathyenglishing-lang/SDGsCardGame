#!/bin/bash
# renew-cert.sh: renew the www.cathylanguagehub.com certificate (certbot in the NPM container) and reload nginx.
docker exec stack-npm-1 certbot renew --cert-name cathylanguagehub --quiet --config-dir /etc/letsencrypt --work-dir /tmp/le-work --logs-dir /tmp/le-logs \
  && docker exec stack-npm-1 nginx -s reload
