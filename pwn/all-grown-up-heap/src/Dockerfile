FROM ghcr.io/downunderctf/docker-vendor/nsjail:ubuntu-24.04

RUN apt-get update \
    && apt-get install -y --no-install-recommends patchelf \
    && rm -rf /var/lib/apt/lists/*

ENV JAIL_CWD=/chal
COPY ./flag.txt /home/ctf/chal/
COPY ./notemanager /home/ctf/chal/pwn
COPY ./ld.so ./libc.so.6 /home/ctf/chal/

RUN patchelf \
    --set-interpreter /chal/ld.so \
    --set-rpath /chal \
    /home/ctf/chal/pwn
