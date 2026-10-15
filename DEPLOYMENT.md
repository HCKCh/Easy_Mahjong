# Stage 3.3.1 Deployment（EC2 / VPS）

架構（依 Synology 部署指南調整；EC2 沒有 DSM，改由 Caddy 擔任 Reverse Proxy）：

```text
Internet --443--> Caddy (HTTPS / WSS, Let's Encrypt 自動憑證)
                    └─> app 127.0.0.1:5173 (non-root, read-only, cap_drop ALL)
                          └─> Redis (password + AOF，只在 Docker network 內)
```

## 設定

```bash
cp .env.example .env
chmod 600 .env
```

### 產生 Redis 密碼

以下任選一個指令，都會產生 64 個隨機的十六進位字元。把結果貼到 `.env` 的 `REDIS_PASSWORD=` 後面：

```bash
openssl rand -hex 32
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
python3 -c "import secrets; print(secrets.token_hex(32))"
```

- **為什麼用十六進位**：只有 0-9、a-f，放進 `redis://` 連線字串不需要跳脫。
- **不要提交 `.env`**：`.gitignore` 已經排除這個檔案，請不要強制加進 git。
- **之後要換密碼**：改完 `.env` 後執行 `sudo docker compose up -d --force-recreate redis app`。房間資料存在 `redis_data` volume，不會遺失。
- **密碼外洩時**（例如 `.env` 被推上 GitHub）：要立刻換新密碼，並把檔案從 git 歷史中清除。只是刪掉檔案再 commit 不夠。

### 網域與憑證

`DOMAIN` 要填一個已經指向主機公網 IP 的網域。

- **沒有網域時**：可以先用 `<IP以-分隔>.sslip.io`。
- **憑證**：HTTPS 憑證由 Caddy 自動向 Let's Encrypt 申請，不需要手動建立任何憑證檔。

`.env`：

```env
DOMAIN=mj.yourdomain.com        # 沒有網域可用 203-0-113-10.sslip.io
REDIS_PASSWORD=<openssl rand -hex 32>
ROOM_TTL_SECONDS=86400
```

## 啟動 / 更新

```bash
sudo docker compose up -d --build
sudo docker compose ps
curl http://127.0.0.1:5173/healthz   # {"ok":true,"stage":"3.3.1",...,"persistence":"redis"}
```

不要執行 `docker compose down -v`，會刪除 `redis_data`（房間）與 `caddy_data`（憑證）。

## EC2 Security Group

只開放 Inbound：

```text
80/tcp   (Let's Encrypt HTTP challenge + 轉址到 HTTPS)
443/tcp
443/udp  (HTTP/3, optional)
22/tcp   僅限自己的 IP
```

不要開放 5173、6379。

## 備份

- 專案資料夾（含 `.env`）
- Docker volumes：`redis_data`、`caddy_data`
