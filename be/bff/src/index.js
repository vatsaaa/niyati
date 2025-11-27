const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const helmet = require('helmet');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const geocodeRouter = require('./routes/geocode');
const paymentsRouter = require('./routes/payments');
const astrologyRouter = require('./routes/astrology');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(helmet());
app.use(cors());
// capture rawBody for webhook signature verification
app.use(bodyParser.json({ limit: '500kb', verify: (req, _res, buf) => { try { req.rawBody = buf.toString(); } catch (e) {} } }));
app.use(bodyParser.urlencoded({ extended: false, verify: (req, _res, buf) => { try { req.rawBody = buf.toString(); } catch (e) {} } }));

// API routes
app.use('/api/geocode', geocodeRouter);
app.use('/api/payments', paymentsRouter);
app.use('/api/astrology', astrologyRouter);

app.get('/', (req, res) => res.json({ status: 'ok', msg: 'Niyati BFF running' }));

app.listen(PORT, () => {
  console.log(`Niyati BFF listening on http://localhost:${PORT}`);
});
