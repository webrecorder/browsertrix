FROM docker.io/library/python:3.10-slim

WORKDIR /app

ADD requirements.txt /app

RUN pip install -r requirements.txt

ADD btrixcloud/ /app/btrixcloud/

CMD uvicorn btrixcloud.main:app_root --host 0.0.0.0 --access-log --log-level info & \
    uvicorn btrixcloud.main_op:app_root --host 0.0.0.0 --port 8756 --access-log --log-level info

EXPOSE 8000
EXPOSE 8756
