FROM ghcr.io/downunderctf/docker-vendor/nsjail:ubuntu-24.04

RUN apt-get update \
    && apt-get install -y --no-install-recommends libc6 \
    && rm -rf /var/lib/apt/lists/*

ENV JAIL_CWD=/chal
COPY ./flag.txt /home/ctf/chal/
COPY ./skatequest /home/ctf/chal/pwn
