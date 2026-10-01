def binary_to_unary(s):
    s = s.replace('1', '01')
    for _ in range(99):
        s = s.replace('10', '011')
    s = s.replace('0', '')
    return s
