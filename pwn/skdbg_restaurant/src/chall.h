/* SPDX-License-Identifier: GPL-2.0 */

#ifndef _SKDBG_CHALL_H
#define _SKDBG_CHALL_H

#include <linux/ioctl.h>
#include <linux/types.h>

#define MAX_ORDERS	16

#define ORDER_TICKET_CMSG	0x1337

struct skdbg_order_req {
	__u64	ticket;
	__u64	flags;
};

struct skdbg_add_dish_req {
	__u64	ticket;
	void	*data;
	__u64	len;
};

struct skdbg_ready_req {
	__u64	ticket;
	__u32	abort_code;
};

struct skdbg_serve_dish_req {
	void	*buf;
	__u64	len;
	__u32	flags;
	void	*ctl;
	__u64	ctllen;
};

struct skdbg_order_info {
	__u64	ticket;
	__u32	ref;
	__u32	state;
	__u64	flags;
};

struct skdbg_orders_info {
	__u32	nr;
	struct skdbg_order_info orders[MAX_ORDERS];
};

#define SKDBG_IOC_MAGIC	'K'

#define SKDBG_ORDER	_IOW(SKDBG_IOC_MAGIC, 0x10, struct skdbg_order_req)
#define SKDBG_DISH	_IOW(SKDBG_IOC_MAGIC, 0x11, struct skdbg_add_dish_req)
#define SKDBG_READY_ORDER		_IOW(SKDBG_IOC_MAGIC, 0x12, struct skdbg_ready_req)
#define SKDBG_SERVE_DISH	_IOWR(SKDBG_IOC_MAGIC, 0x13, struct skdbg_serve_dish_req)
#define SKDBG_PEEK_KITCHEN _IOR(SKDBG_IOC_MAGIC, 0x14, struct skdbg_orders_info)

#endif /* _SKDBG_CHALL_H */