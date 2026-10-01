#include "buf.h"
#include "ssh.h"
#include "log.h"
#include "numtostr.h"
#include "packet.h"
#include <stdio.h>

int packet_get_flag(struct buf *b) {

    char strnum[NUMTOSTR_LEN];
    FILE *fptr = fopen("/home/ctf/chal/flag.txt", "r");
    char flag[32];
    fgets(flag, 32, fptr);
    fclose(fptr);
    buf_purge(b);
    buf_putnum8(b, SSH_MSG_FLAG);
    buf_putstring(b, flag);
    packet_put(b);
    return packet_sendall();
}
