#!/bin/sh
exec socat TCP-LISTEN:1337,reuseaddr,fork,max-children=2 \
  EXEC:/chal/vm.sh,pty,stderr,setsid,sane
