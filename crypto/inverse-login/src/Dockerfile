FROM ghcr.io/downunderctf/docker-vendor/nsjail:ubuntu-24.04

RUN pip install -t /lib/python3/dist-packages pycryptodome

ENV FLAG=skbdg{the_inverse_of_login_is_probably_logout_but_please_do_not_logout}

COPY ./server.py /home/ctf/chal/pwn
