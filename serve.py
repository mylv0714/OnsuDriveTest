# 개발용 서버: 브라우저가 옛 JS 모듈을 캐시해 두고 새 파일과 섞어 쓰지 않도록 캐시를 끈다
#   python serve.py  →  http://localhost:8123/
import http.server
import socketserver

PORT = 8123


class NoCacheHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store, must-revalidate')
        super().end_headers()


class Server(socketserver.ThreadingMixIn, http.server.HTTPServer):
    daemon_threads = True
    allow_reuse_address = True


if __name__ == '__main__':
    with Server(('', PORT), NoCacheHandler) as httpd:
        print(f'http://localhost:{PORT}/ (Ctrl+C로 종료)')
        httpd.serve_forever()
