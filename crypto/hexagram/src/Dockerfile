FROM ghcr.io/downunderctf/docker-vendor/nsjail:ubuntu-24.04

RUN pip install -t /lib/python3/dist-packages pycryptodome joserfc

ENV TIME_LIMIT=600
ENV FLAG=skbdg{b4s3_s1xty_four_decod1ng_c4n_be_surpr1s1ng}

COPY ./server.py /home/ctf/chal/pwn
