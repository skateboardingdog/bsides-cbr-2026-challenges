import unicodedata
print(unicodedata.normalize('NFKC', open('../publish/wisdom.txt').read().encode('windows-1252').decode('utf8')))
