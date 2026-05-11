#!/usr/bin/env python3
"""
Nappy Price Tracker - Flask Backend
Runs on nosy box at port 5051
"""

from flask import Flask, jsonify, request, send_from_directory
from flask_cors import CORS
import sqlite3
import json
import time
import requests
from bs4 import BeautifulSoup
from datetime import datetime
import logging
import re

app = Flask(__name__)
CORS(app)

import os
os.environ.setdefault("DISPLAY", ":10")
os.environ.setdefault("XAUTHORITY", "/home/user/.Xauthority")

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

DB_PATH = "nappy_tracker.db"

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
    "Accept-Language": "en-NZ,en;q=0.9",
}

# ---------------------------------------------------------------------------
# Database
# ---------------------------------------------------------------------------

def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    with get_db() as conn:
        conn.executescript("""
            CREATE TABLE IF NOT EXISTS variants (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                retailer TEXT NOT NULL,
                product_type TEXT NOT NULL CHECK(product_type IN ('pants', 'nappies')),
                size INTEGER NOT NULL,
                pack_count INTEGER NOT NULL,
                url TEXT NOT NULL,
                notes TEXT,
                active INTEGER DEFAULT 1,
                created_at TEXT DEFAULT (datetime('now'))
            );

            CREATE TABLE IF NOT EXISTS price_history (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                variant_id INTEGER NOT NULL REFERENCES variants(id),
                price REAL,
                in_stock INTEGER NOT NULL DEFAULT 1,
                is_club INTEGER NOT NULL DEFAULT 0,
                scraped_at TEXT DEFAULT (datetime('now'))
            );
        """)
        _migrate_db(conn)

def _migrate_db(conn):
    row = conn.execute("SELECT sql FROM sqlite_master WHERE name='variants' AND type='table'").fetchone()
    if row and 'UNIQUE' in row['sql']:
        conn.executescript("""
            ALTER TABLE variants RENAME TO _variants_old;
            CREATE TABLE variants (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                retailer TEXT NOT NULL,
                product_type TEXT NOT NULL CHECK(product_type IN ('pants', 'nappies')),
                size INTEGER NOT NULL,
                pack_count INTEGER NOT NULL,
                url TEXT NOT NULL,
                notes TEXT,
                active INTEGER DEFAULT 1,
                created_at TEXT DEFAULT (datetime('now'))
            );
            INSERT INTO variants SELECT * FROM _variants_old;
            DROP TABLE _variants_old;
        """)
        logger.info("DB migrated: removed UNIQUE constraint from variants")
    # Add is_club column if missing
    cols = [r[1] for r in conn.execute("PRAGMA table_info(price_history)").fetchall()]
    if 'is_club' not in cols:
        conn.execute("ALTER TABLE price_history ADD COLUMN is_club INTEGER NOT NULL DEFAULT 0")
        logger.info("DB migrated: added is_club to price_history")


# ---------------------------------------------------------------------------
# Scrapers
# ---------------------------------------------------------------------------

# Retailers that need a real browser (bot-protected)
BROWSER_RETAILERS = {"Woolworths", "The Warehouse"}


def _cffi_get(url, **kwargs):
    from curl_cffi import requests as cf
    s = cf.Session(impersonate="chrome120")
    return s.get(url, headers=HEADERS, timeout=15, **kwargs)


def _parse_price(text: str) -> float | None:
    """Parse a price string like '$46.00', '$\n46\n00', '46.00' → float."""
    digits = re.findall(r'\d+', text)
    if len(digits) >= 2:
        return float(f"{digits[0]}.{digits[1]:0<2}")
    elif len(digits) == 1:
        return float(digits[0])
    return None


def make_browser():
    """Launch system Firefox on the desktop display. Returns a Selenium WebDriver."""
    import os
    from selenium import webdriver
    from selenium.webdriver.firefox.options import Options
    from selenium.webdriver.firefox.service import Service
    from webdriver_manager.firefox import GeckoDriverManager

    os.environ.setdefault("DISPLAY", ":10")
    os.environ.setdefault("XAUTHORITY", "/home/user/.Xauthority")

    options = Options()
    options.set_preference("dom.webdriver.enabled", False)
    options.set_preference("useAutomationExtension", False)
    service = Service(GeckoDriverManager().install())
    return webdriver.Firefox(service=service, options=options)


def _browser_get_price(driver, url, price_selector, oos_selector=None, wait=12):
    """
    Navigate to url in an existing driver, wait for price_selector, return dict.
    price_selector: CSS selector whose text contains the price (dollars split or plain).
    oos_selector:   CSS selector present when product is OOS (optional).
    """
    from selenium.webdriver.common.by import By
    from selenium.webdriver.support.ui import WebDriverWait
    from selenium.webdriver.support import expected_conditions as EC

    driver.get(url)
    try:
        def _has_price_text(d):
            els = d.find_elements(By.CSS_SELECTOR, price_selector)
            return any((el.text or el.get_attribute("innerText") or "").strip() for el in els)

        WebDriverWait(driver, wait).until(_has_price_text)
    except Exception:
        # Check for OOS before giving up
        if oos_selector:
            try:
                driver.find_element(By.CSS_SELECTOR, oos_selector)
                return {"price": None, "in_stock": False, "error": "out_of_stock"}
            except Exception:
                pass
        return {"price": None, "in_stock": False, "error": "price_element_not_found"}

    if oos_selector:
        try:
            driver.find_element(By.CSS_SELECTOR, oos_selector)
            return {"price": None, "in_stock": False, "error": "out_of_stock"}
        except Exception:
            pass

    els = driver.find_elements(By.CSS_SELECTOR, price_selector)
    price = None
    for el in els:
        txt = el.text.strip() or el.get_attribute("innerText").strip()
        if txt:
            price = _parse_price(txt)
            if price:
                break
    if price is None:
        return {"price": None, "in_stock": False, "error": "price_parse_fail"}
    return {"price": price, "in_stock": True}


def scrape_woolworths(url: str, driver=None) -> dict:
    own = driver is None
    if own:
        driver = make_browser()
    try:
        return _browser_get_price(
            driver, url,
            price_selector="[class*='presentPrice']",
            oos_selector="[class*='outOfStock'], [class*='out-of-stock']",
        )
    except Exception as e:
        return {"price": None, "in_stock": False, "error": str(e)}
    finally:
        if own:
            driver.quit()


def _scrape_foodstuffs(url: str) -> dict:
    """Foodstuffs NZ (New World + Pak'nSave) — club price via JSON-LD."""
    try:
        from curl_cffi import requests as cf
        from bs4 import BeautifulSoup as BS
        s = cf.Session(impersonate="chrome124")
        r = s.get(url, headers=HEADERS, timeout=20)
        if "Just a moment" in r.text:
            return {"price": None, "in_stock": False, "error": "cloudflare_blocked"}
        soup = BS(r.text, "html.parser")
        for script in soup.find_all("script", type="application/ld+json"):
            try:
                d = json.loads(script.string)
                if "Product" in str(d.get("@type", "")):
                    offers = d.get("offers", {})
                    price = float(offers["price"])
                    avail = offers.get("availability", "")
                    in_stock = "InStock" in avail
                    return {"price": price, "in_stock": in_stock, "is_club": True}
            except Exception:
                pass
        return {"price": None, "in_stock": False, "error": "no_json_ld_price"}
    except Exception as e:
        return {"price": None, "in_stock": False, "error": str(e)}


def scrape_paknsave(url: str, driver=None) -> dict:
    return _scrape_foodstuffs(url)


def scrape_newworld(url: str, driver=None) -> dict:
    return _scrape_foodstuffs(url)


def scrape_thewarehouse(url: str, driver=None) -> dict:
    own = driver is None
    if own:
        driver = make_browser()
    try:
        return _browser_get_price(
            driver, url,
            price_selector="[class*='price'], [data-price]",
            oos_selector="[class*='out-of-stock'], .sold-out",
        )
    except Exception as e:
        return {"price": None, "in_stock": False, "error": str(e)}
    finally:
        if own:
            driver.quit()


def scrape_chemistwarehouse(url: str, driver=None) -> dict:
    try:
        r = _cffi_get(url)
        r.raise_for_status()
        soup = BeautifulSoup(r.text, "html.parser")
        price_el = soup.select_one(".Price")
        if price_el:
            price = _parse_price(price_el.get_text())
            if price is not None:
                return {"price": price, "in_stock": True}
        return {"price": None, "in_stock": False, "error": "selector_miss"}
    except Exception as e:
        return {"price": None, "in_stock": False, "error": str(e)}


SCRAPERS = {
    "Woolworths":         scrape_woolworths,
    "Pak'nSave":          scrape_paknsave,
    "New World":          scrape_newworld,
    "The Warehouse":      scrape_thewarehouse,
    "Chemist Warehouse":  scrape_chemistwarehouse,
}

# ---------------------------------------------------------------------------
# API Routes
# ---------------------------------------------------------------------------

@app.route("/api/variants", methods=["GET"])
def get_variants():
    with get_db() as conn:
        rows = conn.execute("SELECT * FROM variants WHERE active=1 ORDER BY retailer, product_type, size, pack_count").fetchall()
        return jsonify([dict(r) for r in rows])


@app.route("/api/variants", methods=["POST"])
def add_variant():
    data = request.json
    required = ["retailer", "product_type", "size", "pack_count", "url"]
    if not all(k in data for k in required):
        return jsonify({"error": "Missing fields"}), 400
    notes = data.get("notes", "") or ""
    with get_db() as conn:
        existing = conn.execute(
            "SELECT id FROM variants WHERE retailer=? AND product_type=? AND size=? AND pack_count=? AND COALESCE(notes,'')=? AND active=1",
            (data["retailer"], data["product_type"], int(data["size"]), int(data["pack_count"]), notes)
        ).fetchone()
        if existing:
            return jsonify({"error": "Variant already exists (use a different Notes label to track a multi-buy or alternate pack)"}), 409
        conn.execute(
            "INSERT INTO variants (retailer, product_type, size, pack_count, url, notes) VALUES (?,?,?,?,?,?)",
            (data["retailer"], data["product_type"], int(data["size"]), int(data["pack_count"]), data["url"], notes)
        )
    return jsonify({"ok": True})


@app.route("/api/variants/<int:variant_id>", methods=["PUT"])
def update_variant(variant_id):
    data = request.json
    fields = {k: v for k, v in data.items() if k in ["retailer", "product_type", "size", "pack_count", "url", "notes", "active"]}
    if not fields:
        return jsonify({"error": "Nothing to update"}), 400
    set_clause = ", ".join(f"{k}=?" for k in fields)
    values = list(fields.values()) + [variant_id]
    with get_db() as conn:
        conn.execute(f"UPDATE variants SET {set_clause} WHERE id=?", values)
    return jsonify({"ok": True})


@app.route("/api/variants/<int:variant_id>", methods=["DELETE"])
def delete_variant(variant_id):
    with get_db() as conn:
        conn.execute("UPDATE variants SET active=0 WHERE id=?", (variant_id,))
    return jsonify({"ok": True})


@app.route("/api/scrape", methods=["POST"])
def scrape_all():
    """Trigger a full scrape of all active variants."""
    data = request.json or {}
    variant_ids = data.get("variant_ids")  # optional: scrape subset

    with get_db() as conn:
        if variant_ids:
            placeholders = ",".join("?" * len(variant_ids))
            variants = conn.execute(
                f"SELECT * FROM variants WHERE active=1 AND id IN ({placeholders})",
                variant_ids
            ).fetchall()
        else:
            variants = conn.execute("SELECT * FROM variants WHERE active=1").fetchall()

    # Open one shared Firefox for all bot-protected retailers
    needs_browser = any(
        dict(v)["retailer"] in BROWSER_RETAILERS and "PLACEHOLDER" not in dict(v)["url"]
        for v in variants
    )
    browser = None
    if needs_browser:
        logger.info("Launching Firefox for bot-protected retailers...")
        try:
            browser = make_browser()
        except Exception as e:
            logger.warning(f"Could not launch browser: {e}")

    results = []
    for v in variants:
        v = dict(v)
        retailer = v["retailer"]
        scraper = SCRAPERS.get(retailer)

        if not scraper:
            result = {"price": None, "in_stock": False, "error": f"No scraper for {retailer}"}
        elif "PLACEHOLDER" in v["url"]:
            result = {"price": None, "in_stock": False, "error": "URL not configured"}
        else:
            logger.info(f"Scraping {retailer} variant {v['id']} ({v['pack_count']}pk)")
            if retailer in BROWSER_RETAILERS:
                if browser:
                    result = scraper(v["url"], driver=browser)
                else:
                    result = {"price": None, "in_stock": False, "error": "browser unavailable"}
            else:
                result = scraper(v["url"])
            time.sleep(0.5)

        with get_db() as conn:
            conn.execute(
                "INSERT INTO price_history (variant_id, price, in_stock, is_club) VALUES (?,?,?,?)",
                (v["id"], result.get("price"), 1 if result.get("in_stock") else 0, 1 if result.get("is_club") else 0)
            )

        results.append({
            "variant_id": v["id"],
            "retailer": retailer,
            "product_type": v["product_type"],
            "size": v["size"],
            "pack_count": v["pack_count"],
            **result
        })

    if browser:
        browser.quit()
        logger.info("Firefox closed.")

    return jsonify(results)


@app.route("/api/prices/latest", methods=["GET"])
def latest_prices():
    """Latest price for each active variant."""
    with get_db() as conn:
        rows = conn.execute("""
            SELECT v.*, ph.price, ph.in_stock, ph.is_club, ph.scraped_at
            FROM variants v
            LEFT JOIN price_history ph ON ph.id = (
                SELECT id FROM price_history
                WHERE variant_id = v.id
                ORDER BY scraped_at DESC LIMIT 1
            )
            WHERE v.active = 1
            ORDER BY v.retailer, v.product_type, v.size, v.pack_count
        """).fetchall()
        return jsonify([dict(r) for r in rows])


@app.route("/api/prices/history/<int:variant_id>", methods=["GET"])
def price_history(variant_id):
    """Price history for a specific variant."""
    limit = request.args.get("limit", 30, type=int)
    with get_db() as conn:
        rows = conn.execute(
            "SELECT * FROM price_history WHERE variant_id=? ORDER BY scraped_at DESC LIMIT ?",
            (variant_id, limit)
        ).fetchall()
        return jsonify([dict(r) for r in rows])


@app.route("/api/prices/history", methods=["GET"])
def all_history():
    """All price history, joined with variant info. Used for trend charts."""
    product_type = request.args.get("product_type")
    size = request.args.get("size", type=int)
    limit = request.args.get("limit", 200, type=int)

    query = """
        SELECT ph.*, v.retailer, v.product_type, v.size, v.pack_count
        FROM price_history ph
        JOIN variants v ON v.id = ph.variant_id
        WHERE v.active = 1
    """
    params = []
    if product_type:
        query += " AND v.product_type = ?"
        params.append(product_type)
    if size:
        query += " AND v.size = ?"
        params.append(size)
    query += " ORDER BY ph.scraped_at DESC LIMIT ?"
    params.append(limit)

    with get_db() as conn:
        rows = conn.execute(query, params).fetchall()
        return jsonify([dict(r) for r in rows])


@app.route("/api/retailers", methods=["GET"])
def get_retailers():
    return jsonify(list(SCRAPERS.keys()))


@app.route("/health", methods=["GET"])
def health():
    return jsonify({"status": "ok", "time": datetime.now().isoformat()})


@app.route("/")
def index():
    return send_from_directory(".", "index.html")


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    init_db()
    logger.info("Nappy Tracker backend starting on port 5051")
    app.run(host="0.0.0.0", port=5051, debug=False)
