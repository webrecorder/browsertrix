#!/usr/bin/env python3
"""
A web server to record POST requests and return them on a GET request
"""
from http.server import HTTPServer, BaseHTTPRequestHandler
import json

BIND_HOST = "0.0.0.0"
PORT = 18080

post_bodies = []


class EchoServerHTTPRequestHandler(BaseHTTPRequestHandler):
    def do_GET(self):
        self.send_response(200)
        self.end_headers()
        self.wfile.write(json.dumps({"post_bodies": post_bodies}).encode("utf-8"))

    def do_POST(self):
        content_length = int(self.headers.get("content-length", 0))
        body = self.rfile.read(content_length)
        self.send_response(200)
        self.end_headers()
        post_bodies.append(json.loads(body.decode("utf-8").replace("'", '"')))


httpd = HTTPServer((BIND_HOST, PORT), EchoServerHTTPRequestHandler)
httpd.serve_forever()
