# CoSiMo on the GX10 — `~/cosimo-ai`

`cosimo-llm`: a dedicated vLLM serving the stock Qwen3 27B (NVFP4) on the
tailnet IP, port **8007**, bearer-protected. Separate from every other
container on the box. Deploy/update:

```bash
scp infra/gx10/* GX10:~/cosimo-ai/        # compose, .env.example, check script
ssh GX10 'cd ~/cosimo-ai && cp -n .env.example .env && docker compose up -d'
```

Set `VLLM_API_KEY` in `~/cosimo-ai/.env` (same value as `LLM_API_KEY` on the
realtime side). First start downloads ~16 GB of weights; `/health` answers
once loaded (`start_period` 15 min).

**Watchdog** (user crontab, no sudo): `* * * * * ~/cosimo-ai/cosimo-tailnet-check.sh`
— restarts the service if it's missing or bound to a stale tailnet IP, logs
state changes to `~/cosimo-ai/check.log`.

**Auto-connect:** `tailscaled` is a system service (enabled, `WantRunning`),
so the node rejoins on boot; the container has `restart: unless-stopped`.
