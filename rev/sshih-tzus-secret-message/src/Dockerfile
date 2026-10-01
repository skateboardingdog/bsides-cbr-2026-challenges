FROM ghcr.io/downunderctf/docker-vendor/bin-builder:debian-10 as build

COPY ./tinyssh/ /build/tinyssh
COPY ./ucspi-tcp-0.88.tar.gz /build/
COPY ./ucspi-tcp-re.patch.txt /build/

WORKDIR /build
RUN tar xzvf /build/ucspi-tcp-0.88.tar.gz

WORKDIR /build/tinyssh
RUN make clean && make LDFLAGS=-static

WORKDIR /build/ucspi-tcp-0.88
RUN patch -Np1 -i ../ucspi-tcp-re.patch.txt 
RUN make LDFLAGS=-static tcpserver

FROM ghcr.io/downunderctf/docker-vendor/nsjail:debian-10

COPY ./flag.txt /home/ctf/chal/
COPY ./sshkey.pub /home/ctf/.ssh/authorized_keys
RUN chmod 0644 /home/ctf/.ssh/authorized_keys
COPY --from=build ./build/tinyssh/tinysshd /home/ctf/chal/
COPY --from=build ./build/tinyssh/tinysshd-makekey /home/ctf/chal/
COPY --from=build ./build/ucspi-tcp-0.88/tcpserver /home/ctf/chal/

RUN mkdir -p /etc/tinyssh
RUN /home/ctf/chal/tinysshd-makekey /home/ctf/chal/sshkeydir

EXPOSE 1337
CMD ["/home/ctf/chal/tcpserver", "-HRDl0", "0.0.0.0", "1337", "/home/ctf/chal/tinysshd", "/home/ctf/chal/sshkeydir"]
#ENTRYPOINT /bin/bash
