FROM alpine:latest

RUN apk add --no-cache \
    qemu  \
    qemu-system-x86_64 \
    socat \
    busybox-static

WORKDIR /chal
COPY init busybox upload upload_recv drop chall.ko bzImage build_initramfs.sh vm.sh run.sh ./

ARG FLAG="skbdg{good_luck}"
RUN FLAG="$FLAG" BUSYBOX="/chal/busybox" ./build_initramfs.sh

ENV CHAL_MEM="220M"
EXPOSE 1337
RUN adduser -D -u 1000 chal
USER 1000:1000
CMD ["/chal/run.sh"]
