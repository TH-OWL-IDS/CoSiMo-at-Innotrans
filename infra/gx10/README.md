# CoSiMo on the GX10 — `~/cosimo-ai`

`cosimo-llm`: a dedicated vLLM serving the stock Qwen3 27B (NVFP4), bearer-
protected, reachable **only on CoSiMo's own tailnet** at the sidecar's IP,
port **8007**. The box's host Tailscale belongs to another user's tailnet and
is not used: the stack brings its own membership via the `cosimo-tailscale`
sidecar (`network_mode: service:tailscale`). No host port, nothing on the
university LAN. Deploy/update:

```bash
scp infra/gx10/* GX10:~/cosimo-ai/
ssh GX10 'cd ~/cosimo-ai && cp -n .env.example .env && docker compose up -d'
```

`.env`: `VLLM_API_KEY` (= `LLM_API_KEY` on the realtime side) and `TS_AUTHKEY`
(single-use, non-ephemeral, tagged `tag:cosimo-gx10`, from CoSiMo's tailnet
admin console). First start downloads ~16 GB of weights; `/health` answers
once loaded. The sidecar's tailnet IP: `docker exec cosimo-tailscale tailscale ip -4`
(also written to `~/cosimo-ai/.tailnet-ip` by the watchdog).

**Watchdog** (user crontab, no sudo): `* * * * * ~/cosimo-ai/cosimo-tailnet-check.sh`
— restarts missing containers, reports a sidecar without a tailnet IP (auth
key problem), logs state changes to `~/cosimo-ai/check.log`.

**Auto-connect:** both containers are `restart: unless-stopped`; the sidecar
keeps its node state in a volume, so it rejoins after a reboot without a new
key.
