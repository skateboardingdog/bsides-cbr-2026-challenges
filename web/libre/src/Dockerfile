FROM python:3.14-slim-trixie

RUN apt-get update \
    && apt-get install -y --no-install-recommends libreoffice fonts-dejavu \
    && rm -rf /var/lib/apt/lists/*

RUN pip install --no-cache-dir flask gunicorn

WORKDIR /app
COPY static/ ./static/
COPY app.py .

RUN useradd -m ctf
USER ctf

ENV FLAG=skbdg{un1v3rs4l_c0nt3nt_br0k3rs_br0k3r1ng_fl4gs_w0w}

EXPOSE 1337
CMD ["gunicorn", "-b", "0.0.0.0:1337", "--timeout", "60", "app:app"]
