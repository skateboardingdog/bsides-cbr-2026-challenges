FROM ruby:4.0.1@sha256:299b7872d1d2f9e73666ef82ea1d759f1976a8bd16367e8637e3665ff94e942d AS ruby

FROM ghcr.io/downunderctf/docker-vendor/nsjail:ubuntu-24.04@sha256:a0853d266c92078564ba7d864139c9b19a816ff81b9d10fa63e02d105e420a00

COPY --from=ruby /usr/local /usr/local
COPY --from=ruby /usr/local/bin/ruby /usr/bin/ruby

ENV JAIL_CWD=/chal
ENV TIME_LIMIT=1200

COPY ./flag.txt /home/ctf/chal/
COPY ./rw.rb /home/ctf/chal/pwn
