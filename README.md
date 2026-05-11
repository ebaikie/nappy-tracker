# Nappy Tracker

Price tracker for Huggies Ultra Dry (Nappy Pants + Nappies) across NZ retailers.
Runs on nosy box (192.168.4.127) at port 5051.

## Setup

```bash
cd ~/nappy-tracker
pip install -r requirements.txt --break-system-packages
python app.py
```

Or as a systemd service:

```ini
[Unit]
Description=Nappy Tracker
After=network.target

[Service]
WorkingDirectory=/home/eli/nappy-tracker
ExecStart=/usr/bin/python3 /home/eli/nappy-tracker/app.py
Restart=always
User=eli

[Install]
WantedBy=multi-user.target
```

```bash
sudo cp nappy-tracker.service /etc/systemd/system/
sudo systemctl enable --now nappy-tracker
```

## First run

1. Start the backend
2. Open the UI, click **Configure**
3. For each row, click **Edit** and paste the actual product URL from the retailer's site
4. Click **↻ Refresh Prices** — scrapers will run and you'll see what breaks

## Scraper quirks (expected)

Each retailer will likely need selector tweaks. The scraper functions are in `app.py`
under `scrape_woolworths()`, `scrape_paknsave()` etc. They all return:

```python
{"price": 24.99, "in_stock": True}
# or
{"price": None, "in_stock": False, "error": "reason"}
```

Foodstuffs sites (Pak'nSave, New World) are JS-rendered and may need their
internal API endpoint rather than HTML scraping. Check Network tab in devtools
for `/api/products/...` calls.

## Database

SQLite at `nappy-tracker.db` in the working directory.
Tables: `variants`, `price_history`.

## API

- `GET  /api/prices/latest`       — latest price per variant
- `POST /api/scrape`              — trigger scrape of all active variants
- `GET  /api/variants`            — list all variants
- `POST /api/variants`            — add variant
- `PUT  /api/variants/:id`        — update variant (url, pack_count, etc.)
- `DELETE /api/variants/:id`      — soft-delete variant
- `GET  /api/prices/history`      — all history (for charts)
- `GET  /health`                  — health check
