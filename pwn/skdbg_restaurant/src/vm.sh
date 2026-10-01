#!/bin/sh
# Boot the provided kernel with the challenge's initramfs.
#
# Notes:
#  - -m 3G and -smp 2 are required.
#  - panic=-1 makes a crashed VM reboot instead of hanging.
KVM_FLAGS=""

if [ -w /dev/kvm ]; then
    KVM_FLAGS="-enable-kvm -cpu host"
fi

exec qemu-system-x86_64 $KVM_FLAGS \
  -m "$CHAL_MEM" -smp 2 \
  -kernel /chal/bzImage \
  -initrd /chal/initramfs.cpio.gz \
  -append "console=ttyS0 panic=-1" \
  -nographic \
  -monitor none
