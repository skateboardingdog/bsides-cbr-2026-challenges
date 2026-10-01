#define _GNU_SOURCE
#include <stdio.h>
#include <stdlib.h>
#include <unistd.h>
#include <sys/prctl.h>
#include <sys/types.h>
#include <sys/syscall.h>
#include <linux/capability.h>
#include <linux/securebits.h>
#include <grp.h>
#include <errno.h>

#define TARGET_UID 1000
#define TARGET_GID 1000

int main(int argc, char *argv[])
{
    struct __user_cap_header_struct hdr = {
        .version = _LINUX_CAPABILITY_VERSION_3,
        .pid = 0,
    };
    struct __user_cap_data_struct data[2] = {0};
    (void)syscall;

    if (argc < 2) {
        fprintf(stderr, "usage: drop <program> [args...]\n");
        return 1;
    }

    if (setresgid(TARGET_GID, TARGET_GID, TARGET_GID) < 0) {
        perror("setresgid");
        return 1;
    }
    if (setgroups(0, NULL) < 0) {
        perror("setgroups");
        return 1;
    }

    /* Keep our capability sets across the upcoming setuid() */
    if (prctl(PR_SET_SECUREBITS,
              SECBIT_NO_SETUID_FIXUP | SECBIT_NO_SETUID_FIXUP_LOCKED, 0, 0, 0) < 0) {
        perror("PR_SET_SECUREBITS");
        return 1;
    }

    /* Put CAP_NET_RAW into the inheritable set... */
    if (syscall(SYS_capget, &hdr, data) < 0) {
        perror("capget");
        return 1;
    }
    data[0].inheritable = 1 << CAP_NET_RAW;
    if (syscall(SYS_capset, &hdr, data) < 0) {
        perror("capset");
        return 1;
    }

    /* ...clear any stray ambient caps... */
    if (prctl(PR_CAP_AMBIENT, PR_CAP_AMBIENT_CLEAR_ALL, 0, 0, 0) < 0) {
        perror("PR_CAP_AMBIENT_CLEAR_ALL");
        return 1;
    }

    /* ...and raise CAP_NET_RAW as ambient. */
    if (prctl(PR_CAP_AMBIENT, PR_CAP_AMBIENT_RAISE, CAP_NET_RAW, 0, 0) < 0) {
        perror("PR_CAP_AMBIENT_RAISE");
        return 1;
    }

    if (setresuid(TARGET_UID, TARGET_UID, TARGET_UID) < 0) {
        perror("setresuid");
        return 1;
    }

    execv(argv[1], &argv[1]);
    perror("execv");
    return 1;
}