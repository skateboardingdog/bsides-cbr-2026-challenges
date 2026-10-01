/* SPDX-License-Identifier: GPL-2.0
 *
 * Welcome to the skateboarding dog restaurant.
 * 
 * Each order is an object that can sit in the kitchen's
 * rotating rail. Servers serve dishes out of the order.
 *
 */

#include <linux/module.h>
#include <linux/miscdevice.h>
#include <linux/fs.h>
#include <linux/slab.h>
#include <linux/skbuff.h>
#include <linux/mutex.h>
#include <linux/wait.h>
#include <linux/rcupdate.h>
#include <linux/refcount.h>
#include <linux/uaccess.h>
#include <linux/poll.h>
#include <linux/socket.h>

#include "chall.h"

/* ------------------------------------------------------------------ */
/* order state                                                         */
/* ------------------------------------------------------------------ */

enum order_state {
	ORDER_COOKING = 0,
	ORDER_READY,
};

enum order_completion {
	ORDER_WAITING = 0,
	ORDER_SERVED,
};

enum order_flag {
	ORDER_CLOSED = 0,
	ORDER_HAS_TICKET = 1,
};

#define order_is_ready(order) (READ_ONCE((order)->state) == ORDER_READY)
#define order_is_served(order) \
	(order_is_ready(order) && (order)->completion != ORDER_WAITING)

/* ------------------------------------------------------------------ */
/* order structures                                                    */
/* ------------------------------------------------------------------ */

struct kitchen;
struct order;

struct dish {
	u16	offset;			// payload offset
	u16	len;			// payload length
};
#define skdbg_dish(__skb) ((struct dish *)(__skb)->cb)

struct waiter {
	int (*serve)(struct order *, struct sk_buff *);
};

struct order {
	struct rcu_head		rcu;
	struct mutex		server_mutex; // Each order can only have one server
	struct kitchen		*kitchen;		// owning kitchen
	struct list_head	rail_link;	// link in kitchen->rail
	struct sk_buff_head	dishes;
	unsigned long		ticket;
	unsigned long		flags;
	enum order_state		state;
	enum order_completion	completion;
	refcount_t		ref;
	unsigned short		dish_offset;
	unsigned short		len; // How many dishes in this order
	u32			abort_code;
	int			error;
	const struct waiter	*waiter;
	unsigned char		_pad[0x800 - 0x88];
};

struct kitchen {
	spinlock_t		rail_lock;	// protects rail + links
	struct list_head	rail; // The rotating kitchen rail with orders on it
	wait_queue_head_t	rail_bell;	// rung when an order lands
	struct mutex		order_mutex;
	struct order		*orders[MAX_ORDERS];
	unsigned int		nr_orders;
};

/* ------------------------------------------------------------------ */
/* globals                                                             */
/* ------------------------------------------------------------------ */

static struct kmem_cache *order_jar;
static struct miscdevice kitchen_miscdev;

static int first_dish_serve(struct order *order, struct sk_buff *skb)
{
	// Bring cutleries and water or something
	return 0;
}

static struct waiter plain_waiter = {
	.serve = first_dish_serve,
};

static void order_get(struct order *order)
{
	refcount_inc(&order->ref);
}

static void rcu_free_order(struct rcu_head *rcu)
{
	struct order *order = container_of(rcu, struct order, rcu);

	kmem_cache_free(order_jar, order);
}

static void put_order(struct order *order)
{
	if (!refcount_dec_and_test(&order->ref))
		return;

	// An order may only be thrown out if it is not ready
	WARN_ON_ONCE(!order_is_ready(order));

	call_rcu(&order->rcu, rcu_free_order);
}

static struct order *find_order(struct kitchen *kitchen, unsigned long ticket)
{
	unsigned int i;

	for (i = 0; i < kitchen->nr_orders; i++)
		if (kitchen->orders[i]->ticket == ticket)
			return kitchen->orders[i];
	return NULL;
}

/// Place an order with a unique ticket number
static int place_order(struct kitchen *kitchen, unsigned long ticket)
{
	struct order *order;

	// Cannot have orders with duplicate tickets
	if (find_order(kitchen, ticket))
		return -EEXIST;
	
	// Cannot have over SKDBG_MAX_ORDERS orders
	if (kitchen->nr_orders >= MAX_ORDERS)
		return -EBUSY;

	order = kmem_cache_zalloc(order_jar, GFP_KERNEL);
	if (!order)
		return -ENOMEM;

	order->kitchen = kitchen;
	order->ticket = ticket;
	order->waiter = &plain_waiter;
	refcount_set(&order->ref, 1);

	// Insert the order into this kitchen's rotating rail
	mutex_init(&order->server_mutex);
	INIT_LIST_HEAD(&order->rail_link);
	skb_queue_head_init(&order->dishes);

	set_bit(ORDER_HAS_TICKET, &order->flags);

	kitchen->orders[kitchen->nr_orders++] = order;
	return 0;
}

static void ring_bell(struct order *order);

// Toss a dish out of an order
static void toss_dish(struct order *order)
{
	struct sk_buff *skb = skb_dequeue(&order->dishes);

	kfree_skb(skb);
}

// Toss all dishes out of an order
static void clear_dishes(struct sk_buff_head *list)
{
	__skb_queue_purge(list);
}

/// Copy the dish off the order's first plate into the customer buffer.
/// Returns 0 if more remains, -EAGAIN if the plate is empty (or the
/// dish was fully eaten), -EIO if the order is served and -EFAULT if
/// the customer buffer is bogus.
static int inner_serve_dish(struct order *order, struct iov_iter *iter,
		      size_t len, int flags, size_t *_offset)
{
	struct dish *dish;
	struct sk_buff *skb;
	size_t remain;
	unsigned int dish_offset, order_len;
	int copy, ret2;

	// If the order is already served, return -EIO
	if (order_is_served(order))
		return -EIO;

	// If there are no dishes in the order, return -EAGAIN
	skb = skb_peek(&order->dishes);
	if (!skb)
		return -EAGAIN;

	// Which dish in the order is being served?
	dish_offset = order->dish_offset;
	order_len = order->len;
	dish = skdbg_dish(skb);

	if (dish_offset == 0) {
		// First dish in this order. The waiter must bring water and
		// cutleries, so use this special function to do that.
		ret2 = order->waiter->serve(order, skb);
		if (ret2 < 0)
			return ret2;
		dish_offset = dish->offset;
		order_len = dish->len;
	}

	// Take this dish out of the order and update the order state.
	//
	// Yes, the waiter can serve whatever portion of an order as
	// a dish. The user (customer) specifies it. It doesn't make
	// sense but it works.
	remain = len - *_offset;
	copy = order_len;
	if (copy > remain)
		copy = remain;
	if (copy > 0) {
		ret2 = skb_copy_datagram_iter(skb, dish_offset, iter, copy);
		if (ret2 < 0)
			return ret2;
		dish_offset += copy;
		order_len -= copy;
		*_offset += copy;
	}

	if (order_len > 0) {
		// There are still more dishes in the order, reset state if
		// MSG_PEEK was set
		if (!(flags & MSG_PEEK)) {
			order->dish_offset = dish_offset;
			order->len = order_len;
		}
		return 0;
	}

	// No more dishes left in this order, toss it if !MSG_PEEK
	if (!(flags & MSG_PEEK)) {
		toss_dish(order);
		order->dish_offset = 0;
		order->len = 0;
	}
	return -EAGAIN;
}

static void close_order(struct kitchen *kitchen, struct order *order)
{
	bool put = false, putu = false;

	// Guard: if this order is already closed, error
	if (test_and_set_bit(ORDER_CLOSED, &order->flags))
		BUG();

	spin_lock_irq(&kitchen->rail_lock);

	// If the order is still on the rotating rail, take it off
	if (!list_empty(&order->rail_link)) {
		list_del(&order->rail_link);
		put = true;
	}

	order->rail_link.next = NULL;
	order->rail_link.prev = NULL;

	spin_unlock_irq(&kitchen->rail_lock);
	if (put)
		put_order(order);

	if (test_and_clear_bit(ORDER_HAS_TICKET, &order->flags))
		putu = true;

	if (putu)
		put_order(order);
}

/// The customer can take a portion out of the first order on the rotating rail
static long serve_dish(struct kitchen *kitchen, struct msghdr *msg, size_t len,
		       int flags)
{
	struct order *order;
	size_t copied = 0;
	long ret;

try_again:
	mutex_lock(&kitchen->order_mutex);

	// If there are no orders on the rail, just return
	if (list_empty(&kitchen->rail)) {
		mutex_unlock(&kitchen->order_mutex);
		return -EWOULDBLOCK;
	}

	spin_lock_irq(&kitchen->rail_lock);

	// This is the first order on the rail
	order = list_first_entry(&kitchen->rail, struct order, rail_link);

	// If the order is not ready AND it has no dishes in it, toss our
	// reference to the order. This is important because other customers
	// may be peeking at the entire rotating rail at any given moment
	if (!order_is_ready(order) && skb_queue_empty(&order->dishes)) {
		list_del_init(&order->rail_link);
		spin_unlock_irq(&kitchen->rail_lock);
		mutex_unlock(&kitchen->order_mutex);
		put_order(order);
		goto try_again;
	}

	// If MSG_PEEK is set, acquire a reference to the order so other customers can't
	// toss it while we're inspecting it
	//
	// Otherwise, take the order off the rotating rail for the server
	if (!(flags & MSG_PEEK))
		list_del_init(&order->rail_link);
	else
		order_get(order);
	spin_unlock_irq(&kitchen->rail_lock);

	// Only one server at a time can have this order. if another server already 
	// took this order, put it at the front of the rotating rail (orders can have
	// multiple dishes in them)
	if (!mutex_trylock(&order->server_mutex)) {
		spin_lock_irq(&kitchen->rail_lock);
		list_add(&order->rail_link, &kitchen->rail);
		spin_unlock_irq(&kitchen->rail_lock);
		mutex_unlock(&kitchen->order_mutex);
		return -EWOULDBLOCK;
	}

	mutex_unlock(&kitchen->order_mutex);

	// At this point, the order should not be closed
	if (test_bit(ORDER_CLOSED, &order->flags))
		BUG();

	// Tell the customer which order they are eating from.
	if (test_bit(ORDER_HAS_TICKET, &order->flags)) {
		unsigned long ticket = order->ticket;

		ret = put_cmsg(msg, SOL_SOCKET, ORDER_TICKET_CMSG,
			       sizeof(unsigned long), &ticket);
		if (ret < 0)
			goto unlock_put;
	}

	// Inner order serve handling - take dishes out of the order as specified
	ret = inner_serve_dish(order, &msg->msg_iter, len, flags, &copied);
	if (ret == -EAGAIN)
		ret = 0;
	if (ret == -EIO)
		goto release;
	if (ret < 0)
		goto unlock_put;

	if (order_is_ready(order) && skb_queue_empty(&order->dishes))
		goto release;
	
	// If there are more dishes left in the order, put it back and ring the
	// bell
	if (!skb_queue_empty(&order->dishes))
		ring_bell(order);
	ret = copied;
	goto unlock_put;

release:
	// Clear dishes and close the order if execution comes here
	clear_dishes(&order->dishes);
	if (!(flags & MSG_PEEK))
		close_order(kitchen, order);
	ret = 1;

unlock_put:
	// Release this server's reference to 
	mutex_unlock(&order->server_mutex);
	put_order(order);
	return ret;
}

// This function notifies waiters when an order is updated on the rail.
//
// If the order in question is not already on the kitchen's rotating rail,
// then this function also inserts it there.
static void ring_bell(struct order *order)
{
	struct kitchen *kitchen;

	// If the order is already on the rail, don't do anything
	if (!list_empty(&order->rail_link))
		return;

	rcu_read_lock();
	kitchen = rcu_dereference(order->kitchen);

	// If the order doesn't have a kitchen, don't do anything
	if (kitchen) {
		spin_lock_irq(&kitchen->rail_lock);
		
		// If the order is not on the rail, add it to the rail and
		// acquire a reference
		if (list_empty(&order->rail_link)) {
			order_get(order);
			list_add_tail(&order->rail_link, &kitchen->rail);
		}
		spin_unlock_irq(&kitchen->rail_lock);

		// Wake up any pollers to let them know an order arrived in
		// the kitchen
		wake_up_interruptible(&kitchen->rail_bell);
	}
	rcu_read_unlock();
}

// Add the specified dish to the specified order
static int add_dish(struct kitchen *kitchen, struct order *order,
			   const void __user *data, size_t len)
{
	struct dish *dish;
	struct sk_buff *skb;

	skb = alloc_skb(len, GFP_KERNEL);
	if (!skb)
		return -ENOMEM;

	if (copy_from_user(skb_put(skb, len), data, len)) {
		kfree_skb(skb);
		return -EFAULT;
	}
	skb->ip_summed = CHECKSUM_UNNECESSARY;

	dish = skdbg_dish(skb);
	dish->offset = 0;
	dish->len = len;

	spin_lock_irq(&order->dishes.lock);
	__skb_queue_tail(&order->dishes, skb);
	spin_unlock_irq(&order->dishes.lock);

	// Let the kitchen know that a new dish was inserted into the order
	ring_bell(order);
	return 0;
}

static int ready_order(struct kitchen *kitchen, struct order *order, u32 abort_code)
{
	// Don't do anything if the order is already ready
	if (order_is_ready(order))
		return 0;

	order->abort_code = abort_code;
	order->error = 0;
	order->completion = ORDER_SERVED;
	WRITE_ONCE(order->state, ORDER_READY);

	// Order updated
	ring_bell(order);
	return 0;
}

/* ------------------------------------------------------------------ */
/* ioctl handlers                                                     */
/* ------------------------------------------------------------------ */

static int skdbg_ioctl_order(struct kitchen *kitchen, unsigned long arg)
{
	struct skdbg_order_req req;

	if (copy_from_user(&req, (void __user *)arg, sizeof(req)))
		return -EFAULT;

	return place_order(kitchen, req.ticket);
}

static int skdbg_ioctl_add_dish(struct kitchen *kitchen, unsigned long arg)
{
	struct skdbg_add_dish_req req;
	struct order *order;

	if (copy_from_user(&req, (void __user *)arg, sizeof(req)))
		return -EFAULT;

	order = find_order(kitchen, req.ticket);
	if (!order)
		return -ENOENT;

	return add_dish(kitchen, order, req.data, req.len);
}

static int skdbg_ioctl_order_ready(struct kitchen *kitchen, unsigned long arg)
{
	struct skdbg_ready_req req;
	struct order *order;

	if (copy_from_user(&req, (void __user *)arg, sizeof(req)))
		return -EFAULT;

	order = find_order(kitchen, req.ticket);
	if (!order)
		return -ENOENT;

	return ready_order(kitchen, order, req.abort_code);
}

static int skdbg_ioctl_serve_dish(struct kitchen *kitchen, unsigned long arg)
{
	struct skdbg_serve_dish_req req;
	struct msghdr msg = {};
	ssize_t err;

	if (copy_from_user(&req, (void __user *)arg, sizeof(req)))
		return -EFAULT;

	if (req.flags & ~(MSG_PEEK | MSG_DONTWAIT))
		return -EINVAL;

	// This `msghdr` is used to let the user know which order is
	// being served to them.
	msg.msg_control_is_user = true;
	msg.msg_control_user = req.ctl;
	msg.msg_controllen = req.ctllen;
	msg.msg_name = NULL;
	msg.msg_namelen = 0;

	err = import_ubuf(ITER_DEST, req.buf, req.len, &msg.msg_iter);
	if (err < 0)
		return err;

	return serve_dish(kitchen, &msg, req.len, req.flags);
}

static int skdbg_ioctl_peek_kitchen(struct kitchen *kitchen, unsigned long arg)
{
	struct skdbg_orders_info info = {};
	unsigned int i, n = 0;

	for (i = 0; i < kitchen->nr_orders; i++) {
		struct order *order = kitchen->orders[i];

		info.orders[n].ticket = order->ticket;
		info.orders[n].ref = refcount_read(&order->ref);
		info.orders[n].state = order_is_ready(order);
		info.orders[n].flags = order->flags;
		n++;
	}
	info.nr = n;

	if (copy_to_user((void __user *)arg, &info, sizeof(info)))
		return -EFAULT;
	return 0;
}

/* ------------------------------------------------------------------ */
/* file operations                                                    */
/* ------------------------------------------------------------------ */

// A kitchen is tied to the file descriptor opened for this module
static int kitchen_open(struct inode *inode, struct file *file)
{
	struct kitchen *kitchen = kzalloc(sizeof(*kitchen), GFP_KERNEL);

	if (!kitchen)
		return -ENOMEM;

	spin_lock_init(&kitchen->rail_lock);
	INIT_LIST_HEAD(&kitchen->rail);
	init_waitqueue_head(&kitchen->rail_bell);
	mutex_init(&kitchen->order_mutex);

	file->private_data = kitchen;
	return 0;
}

static int kitchen_release(struct inode *inode, struct file *file)
{
	struct kitchen *kitchen = file->private_data;
	unsigned int i;

	// Close all remaining orders
	for (i = 0; i < kitchen->nr_orders; i++) {
		struct order *order = kitchen->orders[i];

		if (!order_is_ready(order)) {
			order->abort_code = 0xdead;
			order->completion = ORDER_SERVED;
			WRITE_ONCE(order->state, ORDER_READY);
		}
		close_order(kitchen, order);
	}

	kfree(kitchen);
	return 0;
}

static long kitchen_ioctl(struct file *file, unsigned int cmd, unsigned long arg)
{
	// The kitchen is this current file descriptor
	struct kitchen *kitchen = file->private_data;

	switch (cmd) {
	case SKDBG_ORDER:
		return skdbg_ioctl_order(kitchen, arg);
	case SKDBG_DISH:
		return skdbg_ioctl_add_dish(kitchen, arg);
	case SKDBG_READY_ORDER:
		return skdbg_ioctl_order_ready(kitchen, arg);
	case SKDBG_SERVE_DISH:
		return skdbg_ioctl_serve_dish(kitchen, arg);
	case SKDBG_PEEK_KITCHEN:
		return skdbg_ioctl_peek_kitchen(kitchen, arg);
	default:
		return -ENOIOCTLCMD;
	}
}

// Let waiters poll on their order to see what the status is
static __poll_t kitchen_poll(struct file *file, poll_table *wait)
{
	struct kitchen *kitchen = file->private_data;
	__poll_t mask = 0;

	poll_wait(file, &kitchen->rail_bell, wait);
	if (!list_empty(&kitchen->rail))
		mask |= EPOLLIN;
	return mask;
}

static const struct file_operations kitchen_fops = {
	.owner		= THIS_MODULE,
	.open		= kitchen_open,
	.release	= kitchen_release,
	.unlocked_ioctl	= kitchen_ioctl,
	.compat_ioctl	= kitchen_ioctl,
	.poll		= kitchen_poll,
};

/* ------------------------------------------------------------------ */
/* module init / exit                                                  */
/* ------------------------------------------------------------------ */

static int __init kitchen_init(void)
{
	int ret;

	order_jar = kmem_cache_create("order_jar",
				     sizeof(struct order), 0,
				     SLAB_HWCACHE_ALIGN | SLAB_NO_MERGE |
				     SLAB_NO_SHEAVES, NULL);
	if (!order_jar)
		return -ENOMEM;

	kitchen_miscdev.name = "skdbg_restaurant";
	kitchen_miscdev.minor = MISC_DYNAMIC_MINOR;
	kitchen_miscdev.fops = &kitchen_fops;
	kitchen_miscdev.mode = 0666;

	ret = misc_register(&kitchen_miscdev);
	if (ret < 0)
		kmem_cache_destroy(order_jar);

	pr_info("restaurant: kitchen ready (%zu-byte orders)\n", sizeof(struct order));
	return ret;
}

static void __exit kitchen_exit(void)
{
	misc_deregister(&kitchen_miscdev);
	kmem_cache_destroy(order_jar);
}

module_init(kitchen_init);
module_exit(kitchen_exit);

MODULE_LICENSE("GPL");
MODULE_AUTHOR("Faith");
MODULE_DESCRIPTION("skdbg_restaurant");