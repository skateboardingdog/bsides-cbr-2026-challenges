#!/usr/bin/env sh

# `mimetypes.guess_type` is designed to return a mimetype given a URL. Normally,
# this is done by matching the file extension against a big dictionary of common
# filetypes.
#
# However if a `data:` URI is passed, `guess_type` takes the mimetype
# from the middle of the URL, and arbitrary mimetypes can be returned here, even
# those which aren't registered or common.

# Ref: https://github.com/python/cpython/blob/1812162f81ef034616294ec9ee53e951f99c9582/Lib/mimetypes.py#L139

curl -v -F 'file=@/dev/null;filename="data:skateboarding/dog,a.dog"' 'http://localhost:1337/upload'

