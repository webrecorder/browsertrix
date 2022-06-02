FROM python:3.9

WORKDIR /app

ADD requirements.txt /app

RUN pip install -r requirements.txt

RUN python-on-whales download-cli

ADD . /app

CMD uvicorn btrixcloud.main:app_root --host 0.0.0.0 --access-log --log-level info

