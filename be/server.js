const express = require('express');
const path = require('path');
const axios = require('axios');
const cheerio = require('cheerio');
const Database = require('better-sqlite3');

const app = express();
// Port z prostředí (nastavuje PM2 přes tankuj100.config.cjs), fallback 3000.
const PORT = process.env.PORT || 3000;

// 👉 připojení k SQLite
const db = new Database(path.join(__dirname, 'db/tankuj100db.sqlite'));

app.use(express.json());

// 👉 statické soubory v aktuálním adresáři
app.use(express.static(path.join(__dirname, '../public')));

// 👉 když někdo jde na root "/", pošli mu index.html
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// ------------------ SCRAPER ENDPOINT ------------------
function parseFuelPrices(html) {
  const $ = cheerio.load(html);
  const fuels = [];

  $('tr[itemscope][itemtype="http://schema.org/Product"]').each((_, el) => {
    const name = $(el).find('[itemprop="name"]').text().trim();
    const price = $(el).find('[itemprop="price"]').attr('content');
    const currency = $(el).find('[itemprop="priceCurrency"]').attr('content') || 'CZK';

    if (name && price) {
      fuels.push({
        name,
        price: parseFloat(price),
        currency,
        unit: 'CZK/l'
      });
    }
  });

  return fuels;
}

app.get('/api/fuel-prices/:id', async (req, res) => {
  const { id } = req.params;
  const url = `https://be.fuelo.net/gasstation/id/${id}`;

  try {
    const response = await axios.get(url, { timeout: 10000 });
    const fuels = parseFuelPrices(response.data);

    if (fuels.length === 0) {
      return res.status(404).json({ error: 'No fuel prices found for given id' });
    }

    res.json(fuels);
  } catch (err) {
    console.error('Error fetching page:', err.message);
    res.status(500).json({ error: 'Failed to fetch or parse data' });
  }
});

// ------------------ ENDPOINTY NA STATION TABULKU ------------------

// GET všechny záznamy
app.get('/api/stations', (req, res) => {
  const rows = db.prepare('SELECT * FROM station').all();
  res.json(rows);
});

// GET záznamy pro mapu na mobilu
app.get('/api/map/', (req, res) => {
  const rows = db.prepare('SELECT id, lat, lon, brand_name, brand_id, station_id FROM station').all();
  res.json(rows);
});

// GET konkrétní záznam podle ID
app.get('/api/detail/:id', (req, res) => {
  const row = db.prepare('SELECT * FROM station WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Station not found' });
  res.json(row);
});

// DELETE konkrétní záznam podle ID
app.delete('/api/stations/:id', (req, res) => {
  const { id } = req.params;

  try {
    const result = db.prepare('DELETE FROM station WHERE id = ?').run(id);

    if (result.changes === 0) {
      return res.status(404).json({ error: 'Station not found or already deleted' });
    }

    res.json({ success: true, message: `Station with ID ${id} deleted successfully.` });
  } catch (err) {
    console.error('DB delete error:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

// INSERT nebo UPDATE záznamu
app.post('/api/stations', (req, res) => {
  const {
    id, lat, lon, brand_name, brand_id, name,
    city, address, zip, phone, worktime,
    services, payments, foursquare_id,
    wikimapia_id, status, error
  } = req.body;

  try {
    db.prepare(`
      INSERT INTO station (
        id, lat, lon, brand_name, brand_id, name,
        city, address, zip, phone, worktime,
        services, payments, foursquare_id,
        wikimapia_id, status, error
      )
      VALUES (@id, @lat, @lon, @brand_name, @brand_id, @name,
              @city, @address, @zip, @phone, @worktime,
              @services, @payments, @foursquare_id,
              @wikimapia_id, @status, @error)
      ON CONFLICT(id) DO UPDATE SET
        lat=@lat, lon=@lon, brand_name=@brand_name, brand_id=@brand_id, name=@name,
        city=@city, address=@address, zip=@zip, phone=@phone, worktime=@worktime,
        services=@services, payments=@payments, foursquare_id=@foursquare_id,
        wikimapia_id=@wikimapia_id, status=@status, error=@error
    `).run({
      id, lat, lon, brand_name, brand_id, name,
      city, address, zip, phone, worktime,
      services, payments, foursquare_id,
      wikimapia_id, status, error
    });

    res.json({ success: true });
  } catch (err) {
    console.error('DB insert error:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

// ------------------ START SERVERU ------------------
app.listen(PORT, () => {
  console.log(`✅ Server běží na http://localhost:${PORT}`);
});