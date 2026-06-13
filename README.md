# Nappy Tracker

Price tracker for Huggies Ultra Dry nappies and nappy pants across NZ retailers. Scrapes prices daily and shows history charts so you can buy at the right time.

## Retailers

| Retailer | Method |
|----------|--------|
| Woolworths NZ | Selenium |
| New World | curl_cffi |
| Pak'nSave | curl_cffi |
| The Warehouse | Selenium |
| Chemist Warehouse | curl_cffi |

## Stack

Flask + SQLite backend, React (JSX via CDN) frontend. Runs as a systemd service.

## Features

- Daily auto-scrape at 11:00 NZST
- Manual refresh via UI
- Price history charts per variant
- Tracks nappies and nappy pants separately across sizes

## Running

```bash
sudo systemctl status nappy-tracker
sudo journalctl -u nappy-tracker -f
```

## Database

SQLite at `nappy_tracker.db`. Tables: `variants`, `price_history`.
