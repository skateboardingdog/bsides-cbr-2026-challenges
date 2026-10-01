#!/bin/sh
set -e

cd "$(dirname "$0")"

ROOT=".vm_root"

rm -rf "$ROOT"
mkdir -p "$ROOT/bin" "$ROOT/sbin" "$ROOT/dev/shm" "$ROOT/proc" "$ROOT/sys"
mkdir -p "$ROOT/etc" "$ROOT/home/ctf" "$ROOT/root" "$ROOT/tmp"

cp "$BUSYBOX" "$ROOT/bin/busybox"
for b in sh ls cat mount mkdir mknod dmesg insmod chmod chown cp mv rm ps id \
         echo sleep grep awk base64 setsid cttyhack stty vi more head tail wc \
         sort uniq strings xxd find clear reset poweroff; do
    ln -sf busybox "$ROOT/bin/$b"
done

cp init drop chall.ko upload upload_recv "$ROOT/"
echo "$FLAG" > "$ROOT/flag.txt"

( cd "$ROOT" && find . -print0 | cpio --null -ov --format=newc 2>/dev/null | gzip -9 > ../initramfs.cpio.gz )
rm -rf "$ROOT"
echo "[+] initramfs.cpio.gz built"
