const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const helmet = require('helmet');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const geocodeRouter = require('./routes/geocode');
const astrologyRouter = require('./routes/astrology');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(helmet());
app.use(cors());
app.use(bodyParser.json({ limit: '500kb' }));
app.use(bodyParser.urlencoded({ extended: false }));

// API routes
app.use('/api/geocode', geocodeRouter);
app.use('/api/astrology', astrologyRouter);

app.get('/', (req, res) => res.json({ status: 'ok', msg: 'Niyati BFF running' }));

app.listen(PORT, () => {
  console.log(`Niyati BFF listening on http://localhost:${PORT}`);
});
