FROM ghcr.io/downunderctf/docker-vendor/nsjail:ubuntu-24.04
# ^ this image uses python 3.12

RUN pip install -t /lib/python3/dist-packages pycryptodome joserfc

ENV TIME_LIMIT=600
ENV FLAG=skbdg{test_flag}

COPY ./server.py /home/ctf/chal/pwn
