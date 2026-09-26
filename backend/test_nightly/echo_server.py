#!/usr/bin/env python3
"""
A web server to record POST requests and return them on a GET request
"""

import json
from http.server import BaseHTTPRequestHandler, HTTPServer

BIND_HOST = "0.0.0.0"
PORT = 18080

post_bodies = []


class EchoServerHTTPRequestHandler(BaseHTTPRequestHandler):
    def do_GET(self):
        if self.path.endswith("/webhooks"):
            self.send_response(200)
            self.end_headers()
            self.wfile.write(json.dumps({"post_bodies": post_bodies}).encode("utf-8"))

        # link to rate limited page
        elif self.path.endswith("/rl-index.html"):
            self.send_response(200)
            self.send_header("Content-Type", "text/html")
            self.end_headers()
            self.wfile.write(b"<html><body><a href='/rl.html'>Link</a></body></html>")

        # rate limit test
        elif self.path.endswith("/rl.html"):
            self.send_response(429)
            self.end_headers()
            self.wfile.write(b"429 Error")

        else:
            self.send_response(404)
            self.end_headers()
            self.wfile.write(b"404 Error")

    def do_POST(self):
        content_length = int(self.headers.get("content-length", 0))
        body = self.rfile.read(content_length)
        self.send_response(200)
        if self.path.endswith("/portalUrl"):
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(
                json.dumps({"portalUrl": "https://portal.example.com/path/"}).encode(
                    "utf-8"
                )
            )
        else:
            self.end_headers()

        post_bodies.append(json.loads(body.decode("utf-8").replace("'", '"')))


httpd = HTTPServer((BIND_HOST, PORT), EchoServerHTTPRequestHandler)
httpd.serve_forever()
