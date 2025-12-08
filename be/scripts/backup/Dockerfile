FROM postgres:15-alpine

# Small image with pg tools (from postgres) plus awscli for S3 uploads
RUN apk add --no-cache python3 py3-pip bash curl ca-certificates \
  && pip3 install --no-cache-dir awscli

WORKDIR /scripts

COPY entrypoint.sh /scripts/entrypoint.sh
RUN chmod +x /scripts/entrypoint.sh

ENTRYPOINT ["/scripts/entrypoint.sh"]
