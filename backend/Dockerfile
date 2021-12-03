FROM python:3.9

WORKDIR /app

ADD requirements.txt /app

RUN pip install -r requirements.txt

ADD . /app

CMD uvicorn main:app --host 0.0.0.0 --root-path /api --reload --access-log --log-level debug

