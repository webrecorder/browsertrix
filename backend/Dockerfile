FROM docker.io/library/python:3.10-slim

WORKDIR /app

ADD requirements.txt /app

RUN pip install -r requirements.txt

ADD btrixcloud/ /app/btrixcloud/

EXPOSE 8000
