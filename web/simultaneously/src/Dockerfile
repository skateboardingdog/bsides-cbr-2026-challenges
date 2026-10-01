FROM ubuntu:24.04

ENV DEBIAN_FRONTEND=noninteractive

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        apache2 \
        libapache2-mod-php \
        mysql-server \
        php-mysql \
        php-pgsql \
        php-sqlite3 \
        postgresql \
        sqlite3 \
    && rm -rf /var/lib/apt/lists/* /var/www/html/index.html

COPY index.php /var/www/html/index.php
COPY entrypoint.sh /usr/local/bin/simultaneously-entrypoint

RUN chmod 0755 /usr/local/bin/simultaneously-entrypoint

EXPOSE 80

ENTRYPOINT ["simultaneously-entrypoint"]
CMD ["apachectl", "-D", "FOREGROUND"]
