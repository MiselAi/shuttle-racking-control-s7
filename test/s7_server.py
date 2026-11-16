# Independent S7 server (python-snap7) for testing the app's S7 client: DB1, 200 bytes.
import sys, time
from snap7.server import Server
from snap7.type import SrvArea

port = int(sys.argv[1]) if len(sys.argv) > 1 else 11102
db = bytearray(200)
for i in range(100):
    db[i * 2:i * 2 + 2] = (i * 10).to_bytes(2, 'big')
srv = Server()
srv.register_area(SrvArea.DB, 1, db)
db2 = bytearray(50)
srv.register_area(SrvArea.DB, 2, db2)
srv.start(tcp_port=port)
print('ready', flush=True)
try:
    while True:
        time.sleep(1)
finally:
    srv.stop()
