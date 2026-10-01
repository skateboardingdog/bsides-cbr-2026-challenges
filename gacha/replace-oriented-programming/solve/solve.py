def sort_string(s):
    for _ in range(10):
        s = s.replace('ba', 'ab')
        s = s.replace('ca', 'ac')
        s = s.replace('cb', 'bc')
    return s