You should first check out the TIS-100 Reference Manual linked in the challenge
page to get a quick understanding of how the TIS programming language works.
The challenge asks us to find a 4 digit pin that makes the OUT.OK output be `1`.

The first node that takes our input is:

```
ADD UP
SUB 4
JNZ B
ADD 4
MOV ACC, DOWN
MOV UP, DOWN
MOV UP, DOWN
MOV UP, DOWN
JRO 0
B: MOV -1, DOWN
JRO 0
```

This takes the first input value (via `ADD UP`) and puts it into the ACC for
that node. It then subtracts `4` from that value, then jumps to the label `B` if
that value is not zero. Looking at the label `B` towards the bottom, we see that
it moves the value `-1` down and then jumps back to the start of the node's
instructions. Crucially, if we look at the second node:

```
MOV UP, ACC
JLZ B
ADD UP
SUB 11
JNZ B
ADD 11
MOV ACC, DOWN
MOV UP, DOWN
MOV UP, DOWN
JRO 0
B: MOV -1, DOWN
JRO 0
```

we see that it takes the value from the previous node and puts it into the ACC.
It will then jump to the label `B` if that value is negative. Label `B` does
the same thing as before, and passes on the `-1` value. The next node has the
same logic for `B`:

```
MOV UP, ACC
JLZ B
ADD UP
SUB 14
JNZ B
ADD 14
MOV ACC, DOWN
MOV UP, DOWN
JRO 0
B: MOV -1, DOWN
JRO 0
```

And finally, the last node:

```
MOV UP, ACC
JLZ B
ADD UP
SUB 20
JNZ B
MOV 1, DOWN
JRO 0
B: MOV 0, DOWN
JRO 0
```

will move `0` into the output if it hits `B`.

From this, we gather that `B` is "incorrect", and we must avoid jumping to
label `B`. This means, the first input value must be `4` so that subtracting
`4` from the first input value _is_ zero. Looking back at the first node after
the `JNZ B` instruction, we see that it adds back the `4` value and then moves
the ACC value down, followed by moving the next three input values down as
well.

At this point, the second node will execute with `4` as the input value from
above. It will then `ADD UP` to add the _next_ input pin value and perform the
`SUB X`, `JNZ B`, `ADD X` sequence of instructions, which essentially checks
whether the value in ACC equals `X` or not. In this case, `X` is `11`, and so
the second input value must be `7` (since `4 + 7 = 11`). The next two nodes
have the same logic, with `14` and `20` respectively, leaving us with the third
pin value being `3` and the last pin value being `6`.
