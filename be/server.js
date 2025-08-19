const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');

const app = express();
const PORT = 3000;

// Funkce pro parsování HTML -> JSON
function parseFuelPrices(html) {
  const $ = cheerio.load(html);
  const fuels = [];

  $('tr[itemscope][itemtype="http://schema.org/Product"]').each((_, el) => {
    const name = $(el).find('[itemprop="name"]').text().trim();
    const price = $(el).find('[itemprop="price"]').attr('content'); // čisté číslo
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

// Endpoint: GET /api/fuel-prices/:id
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

app.listen(PORT, () => {
  console.log(`✅ Server běží na http://localhost:${PORT}`);
});