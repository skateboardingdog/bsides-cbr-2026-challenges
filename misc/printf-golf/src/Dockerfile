FROM ubuntu:24.04 AS nsjail-builder

RUN apt-get update && apt-get install -y --no-install-recommends \
      git ca-certificates build-essential autoconf bison flex \
      libprotobuf-dev libnl-route-3-dev libtool pkg-config protobuf-compiler \
  && rm -rf /var/lib/apt/lists/*

RUN git clone --depth 1 --branch 3.4 https://github.com/google/nsjail.git /nsjail \
  && make -C /nsjail -j "$(nproc)" && strip /nsjail/nsjail


FROM ubuntu:24.04

RUN apt-get update && apt-get install -y --no-install-recommends \
      python3 libprotobuf32t64 libnl-route-3-200 libnl-3-200 \
  && rm -rf /var/lib/apt/lists/*

COPY --from=nsjail-builder /nsjail/nsjail /usr/local/bin/nsjail

COPY ./check.py /srv/chal/
COPY ./printf_golf /srv/chal/
COPY ./nsjail.cfg /srv/chal/

EXPOSE 1337
CMD ["/usr/local/bin/nsjail", "--config", "/srv/chal/nsjail.cfg", \
     "--mode", "l", "--port", "1337", \
     "--bindmount_ro", "/srv/chal:/chal"]
