#!/usr/bin/env python3
"""Copy the offline preview template, then serve it on loopback only."""
import argparse
from functools import partial
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from pathlib import Path
import shutil
import sys

class Handler(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store')
        super().end_headers()
    def log_message(self, fmt, *args):
        if args and str(args[1] if len(args)>1 else '') not in ('200','304'):
            super().log_message(fmt,*args)

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--dest', type=Path, required=True, help='Project-specific preview directory')
    parser.add_argument('--scene', type=Path, help='Optional initial JSON scene; used only for a new directory')
    parser.add_argument('--port', type=int, default=0, help='0 chooses a free loopback port')
    parser.add_argument('--init-only', action='store_true')
    args = parser.parse_args()
    source = Path(__file__).resolve().parent.parent / 'assets' / 'threejs-preview'
    dest = args.dest.expanduser().resolve()
    if dest == source.resolve() or source.resolve() in dest.parents:
        parser.error('Use a project directory, not the shared skill assets directory')
    if dest.exists():
        if args.scene:
            parser.error('--scene is only accepted when creating a new preview directory')
        if not (dest / 'index.html').is_file() or not (dest / 'scene.json').is_file():
            parser.error('Existing destination is not a preview project; choose a new directory')
        print('Reusing existing preview files without overwriting them.', flush=True)
    else:
        if args.scene and not args.scene.is_file():
            parser.error('--scene file does not exist')
        shutil.copytree(source,dest)
        if args.scene:
            shutil.copyfile(args.scene,dest / 'scene.json')
    if args.init_only:
        print(dest)
        return
    handler=partial(Handler,directory=str(dest))
    with ThreadingHTTPServer(('127.0.0.1',args.port),handler) as server:
        print(f'PREVIEW_URL=http://127.0.0.1:{server.server_port}/',flush=True)
        print(f'PROJECT_DIR={dest}',flush=True)
        print('Local read-only file server; Ctrl+C to stop.',flush=True)
        try: server.serve_forever()
        except KeyboardInterrupt: pass

if __name__=='__main__':
    main()
