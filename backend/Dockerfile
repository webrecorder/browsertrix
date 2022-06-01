FROM python:3.9

WORKDIR /app

ADD requirements.txt /app

RUN pip install -r requirements.txt

ADD . /app

CMD uvicorn main:app_root --host 0.0.0.0 --access-log --log-level info

