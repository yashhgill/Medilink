"""Network fault injector for the clinic-to-cloud link.

A TCP proxy that sits between a clinic node and its cloud database, so an
outage can be induced on demand and timed precisely, without touching either
node. Control it over HTTP:

    GET /up              forward traffic normally
    GET /down            refuse: drop live connections, reset new ones
                         (what a router reboot or ISP outage looks like)
    GET /blackhole       accept but forward nothing (packet loss, dead Wi-Fi)
    GET /latency?ms=200  add one-way delay to every chunk
    GET /state           current mode

    python netfault.py LISTEN_PORT TARGET_HOST TARGET_PORT CONTROL_PORT
"""
import asyncio, sys, json, time

LISTEN, THOST, TPORT, CTRL = int(sys.argv[1]), sys.argv[2], int(sys.argv[3]), int(sys.argv[4])
state = {"mode": "up", "latency_ms": 0, "since": time.time(), "conns": 0}
live = set()


async def pipe(r, w):
    try:
        while True:
            data = await r.read(65536)
            if not data:
                break
            while state["mode"] == "blackhole":
                await asyncio.sleep(0.05)
            if state["mode"] == "down":
                break
            if state["latency_ms"]:
                await asyncio.sleep(state["latency_ms"] / 1000)
            w.write(data)
            await w.drain()
    except Exception:
        pass
    finally:
        try:
            w.close()
        except Exception:
            pass


async def handle(cr, cw):
    if state["mode"] == "down":
        cw.transport.abort()
        return
    try:
        sr, sw = await asyncio.open_connection(THOST, TPORT)
    except Exception:
        cw.close()
        return
    pair = (cw, sw)
    live.add(pair)
    state["conns"] += 1
    await asyncio.gather(pipe(cr, sw), pipe(sr, cw))
    live.discard(pair)


async def control(r, w):
    line = (await r.readline()).decode()
    while (await r.readline()) not in (b"\r\n", b"\n", b""):
        pass
    path = line.split(" ")[1] if " " in line else "/"
    if path.startswith("/down"):
        state.update(mode="down", since=time.time())
        for cw, sw in list(live):
            for x in (cw, sw):
                try:
                    x.transport.abort()
                except Exception:
                    pass
        live.clear()
    elif path.startswith("/blackhole"):
        state.update(mode="blackhole", since=time.time())
    elif path.startswith("/up"):
        state.update(mode="up", since=time.time())
    elif path.startswith("/latency"):
        state["latency_ms"] = int(path.split("ms=")[1]) if "ms=" in path else 0
    body = json.dumps(state).encode()
    w.write(b"HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: %d\r\n\r\n" % len(body) + body)
    await w.drain()
    w.close()


async def main():
    await asyncio.start_server(handle, "127.0.0.1", LISTEN)
    await asyncio.start_server(control, "127.0.0.1", CTRL)
    print(f"netfault {LISTEN} -> {THOST}:{TPORT}, control :{CTRL}", flush=True)
    await asyncio.Event().wait()

asyncio.run(main())
