CC ?= cc

CPPFLAGS ?=
CFLAGS ?= -O2 -g -Wall -Wextra -Wpedantic -std=c11 -fPIE
LDFLAGS ?= -pie -Wl,-z,relro,-z,now
LDLIBS ?=

TARGET := notemanager
OBJECTS := chall.o babyheap.o
DEPS := $(OBJECTS:.o=.d)

.PHONY: all clean

all: $(TARGET)

$(TARGET): $(OBJECTS)
	$(CC) $(LDFLAGS) -o $@ $(OBJECTS) $(LDLIBS)

chall.o: chall.c babyheap.h
	$(CC) $(CPPFLAGS) $(CFLAGS) -MMD -MP -c $< -o $@

babyheap.o: babyheap.c babyheap.h
	$(CC) $(CPPFLAGS) $(CFLAGS) -fno-builtin -MMD -MP -c $< -o $@

clean:
	$(RM) $(TARGET) $(OBJECTS) $(DEPS)

-include $(DEPS)
